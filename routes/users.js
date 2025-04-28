const express = require('express');
const router = express.Router();

require('../models/connection.js');
const User = require('../models/users.js');
const { checkBody } = require('../modules/checkBody.js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middlewares/authMiddleware.js');

const {rolePermissions, hasPermission, getPermissionsForRole, getAllRoles} = require('../config/roles.js')
const { requireRole, requirePermission, hasPermission } = require('../middlewares/roleMiddleware.js');


function generateAccessToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_REFRESH_KEY, { expiresIn: process.env.JWT_EXPIRATION_TIME });
};

function generateRefreshToken(userData) {
    return jwt.sign(userData, process.env.JWT_SECRET_REFRESH_KEY, { expiresIn: '1y' });
};



// Création de USER
// POST
router.post('/register', function (req, res, next) {

    // Vérifie si un param est manquant
    if (!checkBody(req.body, ['email', 'password', 'firstname', 'lastname', 'username', 'phone'])) {
        res.json({ result: false, error: 'Un ou plusieurs champs manquants ou vides' });
        return;
    }

    const { email, password, firstname, lastname, phone, username } = req.body;

    // Vérifie si le user existe déjà
    User.findOne({ email }).then(data => {
        // Si non trouvé
        if (data === null) {
            // Hash le MDP pour le new USER
            const hash = bcrypt.hashSync(password, 10);
            const userData = { username, firstname, lastname, email, phone };
            const accessToken = generateAccessToken(userData);
            const refreshToken = generateRefreshToken({ email });

            // Création new USER
            const newUser = new User({ ...userData, password: hash, accessToken, refreshToken });

            // Sauvegarde new User dans la DB
            newUser.save().then(newDoc => {
                res.json({ result: true, message: 'Nouvel User créé', data: { username, firstname, lastname, email, phone, accessToken, refreshToken } });
            });

        } else {
            // Si le USER existe déjà
            res.json({ result: false, error: `L'utilisateur existe déjà` });
        }
    });
});

// Login du USER
// POST
router.post('/login', async (req, res, next) => {
    // Check les params
    if (!checkBody(req.body, ['email', 'password'])) {
        res.json({ result: false, error: 'Un ou plusieurs champs manquants ou vides' });
        return;
    }

    const { email, password } = req.body;

    // Vérifie si le USER existe
    const foundUser = await User.findOne({ email });

    // Si USER n'existe pas dans la DB
    if (!foundUser || !(await bcrypt.compare(password, foundUser.password))) {
        return res.status(401).send('Error : Non autorisé');
    }

    // Génère les token et MAJ user dans la DB
    const { username, firstname, lastname, phone } = foundUser;
    const accessToken = generateAccessToken({ email, firstname, lastname, username, phone })
    const refreshToken = generateRefreshToken({ email });
    foundUser.accessToken = accessToken;
    foundUser.refreshToken = refreshToken;
    const result = await foundUser.save();
    // Send Response with user data
    res.json({ result: true, data: { username, email, firstname, lastname, phone, accessToken, refreshToken } });
});


// Logout
// PUT
router.post('/logout', authenticateToken, async (req, res,) => {
    const { email, username, firstname, lastname, phone } = req.user;

    const foundUser = await User.findOne({ email: req.user.email });

    if (!foundUser) {
        return res.status(401).send('Error : User not found');

    }

    const accessToken = jwt.sign({ email, firstname, lastname, phone, username }, process.env.JWT_SECRET_KEY, { expiresIn: 1 });
    const refreshToken = jwt.sign({ email: req.user.email }, process.env.JWT_SECRET_REFRESH_KEY, { expiresIn: 1 });
    foundUser.accessToken = accessToken;
    foundUser.refreshToken = refreshToken;
    const result = await foundUser.save();

    res.json({ result: true, data: 'Vous êtes déconnecté(e)' });
});

// Regénérer l'accessToken à partir du RefreshToken
//POST
router.post('/refreshToken', async (req, res) => {

    // Vérifie que le refreshtoken est dans le request body
    const refreshToken = req.body.refreshToken;

    // Si pas de token, reourne une erreur
    if (!refreshToken) return res.status(401).json({ error: 'Accès Refusé' });

    // Vérifie la validité du refreshToken
    jwt.verify(refreshToken, process.env.JWT_SECRET_REFRESH_KEY, async (err, user) => {
        console.log(user);
        if (err) {
            // Token invalide => erreur
            return res.status(401).json({ error: 'Accès Refusé' });
        }

        // Vérifie dans la DB que le USER est existant
        const foundUser = await User.findOne({ email: user.email });

        // Si pas de User ou MDP incorrect => error 401
        if (!foundUser) {
            return res.status(401).json({ error: 'Accès Refusé' });
        };
        console.log('foundUser', foundUser.username);
        console.log('foundUser RefreshToken', foundUser.refreshToken);

        // Vérifie si un nouveau refreshToken a été créé aprèes celui-ci.
        const savedRefreshToken = jwt.decode(foundUser.refreshToken, process.env.JWT_SECRET_REFRESH_KEY);
        console.log('savedRefreshToken decoded', savedRefreshToken);

        if (savedRefreshToken.iat > user.iat) {
            // RefreshToken dans la request est + vieille que le refreshToken dans la DB
            // Une déconnecxion a déjà eu lieu
            return res.status(401).json({ error: 'Accès Refusé, mauvais Token' });
        }

        const { firstname, lastname, phone } = foundUser;

        // Détruis issued at et expiration key
        delete user.iat;
        delete user.exp;

        // Génère un nouvel accessToken et update User dans la DB
        const refreshedAccessToken = generateAccessToken({ email: user.email, firstname, lastname, phone });
        console.log(refreshedAccessToken);
        foundUser.accessToken = refreshedAccessToken;
        const result = await foundUser.save();
        // Renvoi une réponse avec 
        res.send({ accessToken: refreshedAccessToken });
    })
})

// Obtenir tous les utilisateurs - nécessite la permission "manage_users"
// GET
router.get('/all', authenticateToken, requirePermission('manage_users', async (req, res) => {
    try {
        const users = await User.find({}, '-password -refreshToken -accessToken');
        res.json({ result: true, data: users });
    } catch (error) {
        res.status(500).json({ result: false, error: 'Erreur serveur' })
    }
}));

// Obtenir un USER spécifique par ID  - nécessite la permission "manage_users"
// GET
router.get('/:userId', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId, '-password -refreshToken -accessToken');

        if (!user) {
            return res.status(404).json({ result: false, error: 'Utilisateur non trouvé' })
        }
        res.json({ result: true, data: user });
    } catch (error) {
        res.status(500).json({ result: false, error: 'Erreur serveur' });
    }
});

// MAJ d'un USER - nécessite la permission "manage_users"
//PUT
router.put('/:userId', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { firstname, lastname, phone, username, email } = req.body;

        // Vérifie si le USER est lui-même ou admin/owner
        const isCurrentUser = req.user._id === userId;
        const canManagerUsers = hasPermission(req.user.role, 'manage_users');

        if (!isCurrentUser && !canManagerUsers) {
            return res.status(403).json({
                result: false,
                error: 'Vous n\'êtes pas autorisé(e) à modifier cet utilisateur'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ result: false, error: 'Utilisateur non trouvé' });
        }

        // MAJ des infos de base du USER
        if (firstname) user.firstname = firstname;
        if (lastname) user.lastname = lastname;
        if (phone) user.phone = phone;
        if (username) user.username = username;

        // Seuls les admin / owner peuvent modifier l'email
        if (email && canManagerUsers) {
            // Vérifie si l'email est déjà utilisé
            const existingUser = await User.findOne({ email, _id: { $ne: userId } });
            if (existingUser) {
                return res.status(400).json({
                    result: false,
                    error: 'Cet email est déjà utilisé par un autre utilisateur'
                });
            }
            user.email = email;
        }

        await user.save();

        res.json({
            result: true,
            data: {
                _id: user._id,
                firstname: user.firstname,
                lastname: user.lastname,
                email: user.eamil,
                phone: user.phone,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ result: false, error: 'Erreur serveur' })
    }
});

//MAJ du rôle d'un USER - nécessite la permission "manage_users"
// PUT

router.put('/:userId/role', authenticateToken, requirePermission('manage_users'), async(req, res) => {
    try {
        const {userId} = req.params;
        const { role} = req.body;

        // Check si le rôle est valide
        const validRoles = getAllRoles();
        if (!validRoles.includes(role)){
            return res.status(400).json({ result : false, error: 'Rôle invalide'})
        }

        // Ne pas permettre aux non-Admin de créer d'autres Admin
        if( role === 'ADMIN' && req.user.role !== 'ADMIN'){
            return res.status(403).json({result: false, error: 'Seul un Admin peut créer un autre Admnin'});
        }

        // Touver et MAJ le USER
        const user = await User.findByIdAndUpdate(userId, {role}, {new: true, select: '-password -refreshToken -accessToken'});

        if (!user){
            return res.status(404).json({result: false, error: 'Utilisateur non trouvé'});
        }

        res.json({result: true, data: user});
    } catch(error){
        res.status(500).json({ result: false, error: 'Erreur serveur'});
    }
});

// Reset le MDP d'un USER - nécessite la permission "manage_users"
//POST
router.post('/:userID/reset-password', authenticateToken, requirePermission('manage_users'), async(req, res) => {
    try {
        const {userId} = req.params;
        const {newPassword} = req.body;

        if(!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                result :false,
                error: 'Le nouveau mot de passe doit contenir au moins 6 caractères'
            });
        }

        const user = await User.findById(userId);

        if(!user){
            return res.status(404).json({ result: false, error: 'Utilisateur non trouvé'});
        }

        // Hasher le nouveau MDP
        const hash = bcrypt.hashSync(newPassword, 10);
        user.password = hash;

        await user.save();

        res.json({
            result: true,
            message: 'Mot de passe réinitialisé avec succès'
        });
    } catch( error){
        res.status(500).json({ result : false, error: 'Erreur serveur'})
    }
});

// Supprimer un USER - nécessite la permission "manage_users"
router.delete('/:userId', authenticateToken, requirePermission('manage_users'), async(req, res) => {
    try{
        const {userId}= req.params;

        // Empêcher la suppression d'un Admin par un non-Admin
        if(req.user.role !== 'ADMIN'){
            const userToDelete = await User.findById(userId);

            if(!userToDelete){
                res.status(404).json({ result: false, error: 'Utilisateur non trouvé'});
            }

            if (userToDelete.role === 'ADMIN'){
                return res.status(403).json({
                    result: false,
                    error: 'Seul un Admin peut supprimer un autre Admin'
                });
            }
        }

        const result = await User.findByIdAndDelete(userId);

        if(!result){
            return res.status(404).json({ result: false, error: 'Utilisateur non trouvé'})
        }
        res.json({ result: true, message: 'Utilisateur supprimé avec succès'})
    } catch( error) {
        res.status(500).json( {result: false, error: 'Erreur serveur'});
    }
});

//  USER routes protégées (test)
// GET 

router.get('/account', authenticateToken, (req, res) => {
    res.json({ message: 'Succès', user: req.user });
});

// Obtenir la liste de tous les rôles disponibles
// GET
router.get('/roles/all', authenticateToken, requirePermission('manage_users'), (req, res) => {
    try {
        const roles = getAllRoles();
        res.json({result: true, data: roles});
    } catch (error) {
        res.status(500).json({result: false, error: 'Erreur serveur'})
    }
});

// Obtenir les permissions pour un rôle spécifique
// GET
router.get('/roles/:rolename/permissions', authenticateToken, requirePermission('manage_users'), (req, res) => {
    try {
        const { roleName} = req.params;

        // Check si le rôle est valide
        const validRoles = getAllRoles();
        if(!validRoles.includes(roleName)) {
            return res.status(400).json({result: false, error : 'Rôle invalide'});
        }

        const permissions = getPermissionsForRole(roleName);
        res.json({ result: true, data : {role: roleName, permissions}});
    } catch(error){
        res.status(500).json({result: false, error: 'Erreur serveur'})
    }
});



module.exports = router;