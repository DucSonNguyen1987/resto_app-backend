// routes/twoFactorAuth.js
const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/users');
const authenticateToken = require('../middlewares/authMiddleware');
const jwt = require('jsonwebtoken');
const { checkBody } = require('../modules/checkBody.js');
const bcrypt = require('bcryptjs');

function generateAccessToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_KEY, { expiresIn: process.env.JWT_EXPIRATION_TIME });
}

function generateRefreshToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_REFRESH_KEY, { expiresIn: '1y' });
}

// Fonction pour générer des codes de secours
function generateBackupCodes(count = 8, length = 10) {
    const codes = [];
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i = 0; i < count; i++) {
        let code = '';
        for (let j = 0; j < length; j++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        codes.push(code);
    }
    return codes;
}

/**
 * Génère un secret 2FA et renvoie un QR code
 * GET /2fa/setup
 * Nécessite: être authentifié
 */
router.get('/setup', authenticateToken, async(req, res) => {
    try {
        console.log('2FA Setup requested by user:', req.user);
        
        // Vérifier si l'utilisateur est ADMIN ou OWNER
        if (req.user.role !== 'ADMIN' && req.user.role !== 'OWNER') {
            console.log('2FA Setup rejected - user role:', req.user.role);
            return res.status(403).json({
                result: false,
                error: 'Seuls les admins et propriétaires peuvent configurer le 2FA'
            });
        }

        console.log('2FA Setup permitted - generating secret');
        
        // Générer un secret 2FA
        const secret = speakeasy.generateSecret({
            name: `Resto App - ${req.user.email}`
        });

        // Générer un QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

        // Sauvegarder temporairement le secret dans la session du USER (secret activé qu'après validation)
        const user = await User.findById(req.user._id);
        user.twoFactorSecret = secret.base32;
        await user.save();

        res.json({
            result: true,
            data: {
                qrCode: qrCodeUrl,
                secret: secret.base32 // Secret sera affiché au USER pour une saisie manuelle
            }
        });
    } catch (error) {
        console.error('Erreur lors de la configuration 2FA:', error);
        res.status(500).json({ result: false, error: 'Erreur serveur' });
    }
});

/**
 * Vérifie et active le 2FA après la configuration
 * POST /2fa/verify
 * Nécessite: être authentifié
 */
router.post('/verify', authenticateToken, async(req, res) => {
    try {
        // Vérifier le token fourni
        if (!checkBody(req.body, ['token'])) {
            return res.status(400).json({
                result: false,
                error: 'Code de vérification manquant'
            });
        }

        const { token } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                result: false,
                error: 'Utilisateur non trouvé'
            });
        }

        // Vérifier si l'utilisateur a un secret 2FA
        if (!user.twoFactorSecret) {
            return res.status(400).json({
                result: false,
                error: 'Aucune configuration 2FA en attente'
            });
        }

        // Vérifier le code TOTP
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: token,
            window: 1 // Tolérance de 1 intervalle de 30 secondes
        });

        if (!verified) {
            return res.status(400).json({
                result: false,
                error: 'Code invalide. Veuillez réessayer.'
            });
        }

        // Activer le 2FA pour l'utilisateur
        user.twoFactorEnabled = true;
        
        // Générer des codes de secours si nécessaire
        if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
            user.twoFactorBackupCodes = generateBackupCodes();
        }

        await user.save();

        res.json({
            result: true,
            message: 'Authentification à deux facteurs activée avec succès',
            data: {
                backupCodes: user.twoFactorBackupCodes
            }
        });
    } catch (error) {
        console.error('Erreur lors de la vérification 2FA:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur'
        });
    }
});

/**
 * Vérifie et active le 2FA lors de la connexion
 * POST 2fa/login-verify
 * Nécessite un token temporaire lors de la tentative de connexion
 */
router.post('/login-verify', async(req, res) => {
    try {
        // Vérifier les paramètres
        if(!checkBody(req.body, ['tempToken', 'token'])) {
            return res.status(400).json({
                result: false,
                error: 'Token temporaire ou code 2FA manquant'
            });
        }

        const {tempToken, token} = req.body;

        // Vérifier le tempToken
        let userId;
        try {
            const decoded = jwt.verify(tempToken, process.env.JWT_SECRET_KEY);
            userId = decoded.userId;
        } catch(error){
            return res.status(401).json({ result: false, error: 'Token temporaire invalide ou expiré'});
        }

        // Trouver l'utilisateur
        const user = await User.findById(userId);
        if(!user || user.tempToken !== tempToken) {
            return res.status(401).json({ result: false, error: 'Token temporaire invalide'});
        }

        // Vérifier si c'est un code de secours
        if (user.twoFactorBackupCodes && user.twoFactorBackupCodes.includes(token)) {
            // Retirer le code de secours utilisé
            user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(code => code !== token);
        } else {
            // Vérifier le code TOTP
            const verified = speakeasy.totp.verify({
                secret: user.twoFactorSecret,
                encoding: 'base32',
                token: token,
                window: 1
            });

            if (!verified) {
                return res.status(400).json({ result: false, error: 'Code 2FA invalide'});
            }
        }

        // Générer les tokens définitifs
        const userData = {
            email: user.email,
            firstname: user.firstname,
            lastname: user.lastname,
            username: user.username,
            phone: user.phone,
            role: user.role,
            _id: user._id
        };

        const accessToken = generateAccessToken(userData);
        const refreshToken = generateRefreshToken({email: user.email});

        // Mettre à jour les tokens de l'utilisateur
        user.accessToken = accessToken;
        user.refreshToken = refreshToken;
        user.tempToken = null;
        await user.save();

        res.json({
            result: true,
            message: 'Authentification réussie',
            data: {
                ...userData,
                accessToken,
                refreshToken
            }
        });
    } catch(error) {
        console.error('Erreur lors de la vérification 2FA pour login:', error);
        res.status(500).json({result: false, error: 'Erreur serveur'});
    }
});

/**
 * Désactiver le 2FA
 * POST /2fa/disable
 * Nécessite: être authentifié
 */
router.post('/disable', authenticateToken, async(req, res) => {
    try {
        // Vérifier si l'utilisateur a fourni son mot de passe pour confirmer
        if (!checkBody(req.body, ['password'])) {
            return res.status(400).json({
                result: false,
                error: 'Mot de passe requis pour désactiver la 2FA'
            });
        }

        const { password } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                result: false,
                error: 'Utilisateur non trouvé'
            });
        }

        // Vérifier si la 2FA est déjà désactivée
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                result: false,
                error: 'L\'authentification à deux facteurs n\'est pas activée'
            });
        }

        // Vérifier le mot de passe
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                result: false,
                error: 'Mot de passe incorrect'
            });
        }

        // Désactiver la 2FA
        user.twoFactorEnabled = false;
        user.twoFactorSecret = null;
        user.twoFactorBackupCodes = [];
        
        await user.save();

        res.json({
            result: true,
            message: 'Authentification à deux facteurs désactivée avec succès'
        });
    } catch (error) {
        console.error('Erreur lors de la désactivation 2FA:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur'
        });
    }
});

/**
 * Génère de nouveaux codes de secours
 * POST /2fa/generate-backup-codes
 * Nécessite être authentifié
 */
router.post('/generate-backup-codes', authenticateToken, async(req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Vérifier si 2FA est activé
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                result: false,
                error: 'L\'authentification à deux facteurs n\'est pas activée'
            });
        }

        // Générer de nouveaux codes de secours
        user.twoFactorBackupCodes = generateBackupCodes();
        await user.save();

        res.json({
            result: true,
            message: 'Nouveaux codes de secours générés avec succès',
            data: {
                backupCodes: user.twoFactorBackupCodes
            }
        });
    } catch(error) {
        console.error('Erreur lors de la génération de codes de secours:', error);
        res.status(500).json({ result: false, error: 'Erreur serveur'});
    }
});

/**
 * Vérifier le statut 2FA de l'utilisateur
 * GET /2fa/status
 * Nécessite: être authentifié
 */
router.get('/status', authenticateToken, async(req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                result: false,
                error: 'Utilisateur non trouvé'
            });
        }

        res.json({
            result: true,
            data: {
                enabled: user.twoFactorEnabled,
                hasBackupCodes: !!(user.twoFactorBackupCodes && user.twoFactorBackupCodes.length > 0)
            }
        });
    } catch (error) {
        console.error('Erreur lors de la vérification du statut 2FA:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;