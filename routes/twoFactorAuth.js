const express = require ('express');
const router = express.Router();
const speakeasy = require ('speakeasy');
const QRCode =require ('qrcode');
const USer = require ('../models/users');
const authenticateToken = require ('../middlewares/authMiddleware');
const jwt = require ('jsonwebtoken');
const {checkBody} = require ('../modules/checkBody.js');
const User = require('../models/users');


function generateAccessToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_KEY, { expiresIn: process.env.JWT_EXPIRATION_TIME });
}

function generateRefreshToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_REFRESH_KEY, { expiresIn: '1y' });
}


/**
 * Génère un secret 2FA et renvoie un QR code
 * GET /2fa/setup
 * Nécessite: être authentifié
 */

router.get('/setup', authenticateToken, async(req, res) => {
    try {
        // Check si le USER est ADMIN ou OWNER
        if (req.user.role !== 'AMDIN' && req.user.role !== 'OWNER') {
            return res.status(403).json({
                result : false,
                error : 'Seuls les admins et propriétaires peuvent configurer le 2FA'
            });
        }

        // Générer un secret 2FA
        const secret = speakeasy.generateSecret({
            name: `Resto App - ${req.user.email}`
        });

        // Générer un QR code
        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

        // Sauvegarder temporairement le secret dans la session du USER ( secret activé qu'après validation)
        const user =  await User.findById(req.user._id);
        user.twoFactorSecret = secret.base32;
        await user.save();

        res.json({
            result :true,
            data :{
                qrCode: qrCodeUrl,
                secret : secret.base32 // Secret sera affiché au USER pour une saisie manuelle
            }
        })
    } catch (error) {
        console.error('Erreur lors de la configuration 2FA:', error);
        res.status(500).json({ result: false, error : 'Erreur serveur'});
    }
});

/**
 * Vérifie et active le 2FA
 * POST 2fa/login-verify
 * Nécessite un token temporaire lors de la tentative de connexion
 */

router.post('/login-verify', async(req, res) => {
    try {
        // Check les paramètres
        if(!checkBody(req.boy, ['tempToken', 'token'])) {
            return res.status (400).json({
                result : false,
                error :'Token temporaire ou code 2F1 manquant'
            });
        }

        const {tempToken, token} = req.body;

        // Check le tempToken
        let UserId;
        try {
            const decoded = jwt.verify(tempToken, process.env.JWT_SECRET_KEY);
            userId = decoded.userId;
        } catch(error){
            return res.status(401).json({ result: false, error :'Token temporaire invalide ou expiré'});
        }

        // Trouver le USER
        const user = await User.findById(userId);
        if(!user || user.tempToken !== tempToken) {
            return res.status(401).json( {result: false, error: 'Token temporaire invalide'});
        }

        // Check si c'est un code de secours
        if (user.twoFactorBackupCodes.includes(token)) {
            // Retirer le code de secours utilisé
            user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter( code => code !== token);
        } else {
            // Check le code TOTP
            const verified = speakeasy.totp.verify({
                secret : user.twoFactorSecret,
                encoding : 'base32',
                token: token,
                window: 1
            });

            if (!verified) {
                return res.status (400).json({ result: false, error: 'Code 2FA invalide'});
            }
        }

        // Générer les tokens définitifs
        const userData = {
            email : user.email,
            firstname : user.username,
            lastname: user.lastname,
            phone: user.phone,
            role: user.role,
            _id : user._id
        };

        const accessToken = generateAccessToken(userData);
        const refreshToken = generateRefreshToken({email: user.email});

        // MAJ les tokens du USER
        user.accessToken= accessToken;
        user.refreshToken = refreshToken;
        user.tempToken = null;
        await user.save();

        res.json({
            result: true,
            message: 'Authentification réussie',
            data :{
                ...userData,
                accessToken,
                refreshToken
            }
        });
    } catch(error) {
        console.error('Erreur lors de la vérification 2FA pour login:', error).
        res.status(500).json({result: false, error: 'Erreur serveur'});
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

        // Check si 2FA est activé
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
            result :true,
            mesage: 'Nouveaux codes de secours générés avec succès',
            data: {
                backupCodes: user.twoFactorBackupCodes
            }
        });
    } catch(error) {
        console.error('Erreur lors de la générationde codes de secours:', error);
        res.status(500).json({ result : false, error :'Erreur serveur'});
    }
});

// Fonction pour générer des codes de secours
function generateBackupCodes (count = 8, length= 10) {
    const codes = [];
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    for (let i= 0; i< count; i++){
        let code = '';
        for (let j =0; j< length; j++) {
            code += characters.charAt(Math.floor(Math.random()* characters.length));
        }
        codes.push(code);
    }
    return codes;
}

module.exports = router;