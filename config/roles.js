/**
 * Configuration du système de rôles et permissions
 * Définit:
 * Les permissions de bases communes à tous les rôles
 * Les permissions spécifiques à chaque rôle
 * Des fonctions utilitaires pour vérifier et gérer les permissions
 */



// Définition des permissions de base accordées à tous les rôles
const basePermissions = ['view_website', 'view_catalog', 'edit_profile'];

// Définition de toutes les permissions valides du système

const allValidPermissions = [

    // Permissions de base
    ...basePermissions,

    // Permissions de réservation
    'view_reservations',
    'create_reservation',
    'edit_reservation',
    'cancel_reservation',

    // Permissions de commande
    'create_order',
    'edit_order',
    'cancel_order',

    // Permissions de catalogue / menu
    'create_catalog_item',
    'edit_catalog_item',
    'delete_catalog_item',

    // Permissions de gestion de salle
    'move_tables',
    'edit_floor_plan',
    'create_floor_plan',

    // Permissions administratives
    'manage_users',
    'all_permissions'
];

// Définition des permissions spécifiques à chaque rôle

const rolePermissions = {
    ADMIN : ['all_permissions'],
    OWNER :[
        
        // Gestion des USERS
        'manage_users',
        
        // Gestion du plan de salle
        'edit_floor_plan',
        'create_floor_plan',
        
        // Catalogue / menu
        'create_catalog_item',
        'edit_catalog_item',
        'delete_catalog_item',

        // Réservations
        'view_reservations',
        'cancel_reservation',

        // Commandes
        'create_order',
        'edit_order',
        'cancel_order',

        // Tables
        'move_tables'
    ],
    MANAGER : [

        // Menu & Catalogue
        'create_catalog_item',
        'edit_catalog_item',
        'delete_catalog_item',

        // Commandes
        'create_order',
        'edit_order',
        'cancel_order',

        // Tables
        'move_tables',

        // Plan de salle
        'edit_floor_plan',

        // Réservations
        'view_reservations'
    ],
    STAFF : [

        // Réservations
        'view_reservations',

        // Commandes
        'create_order',
        'edit_order'
    ],
    USER : [
        // Réservations
        'create_reservation',
        'edit_reservation',
        'cancel_reservation'
    ]
};

// Ajouter automatiquement les permissions de base à chaque rôle
Object.keys(rolePermissions).forEach( role => {
    rolePermissions[role] = [...basePermissions, ...rolePermissions[role]];
});

// Check si une permission est valide dans le système
const isValidPermission = (permission) => {
    return allValidPermissions.includes(permission);
};


// Fonction pour vérifier si un rôle a une permission spécifique
const hasPermission = (role, permission) => {
    if(!role || !rolePermissions[role]){
        return false
    }
    // Check si la permission est valide
    if(!isValidPermission(permission)){
        console.warn(`Permission invalide demandée : ${permission}`);
        return false;
    } 
    // Si le rôle a la permission all_permissions, accorder tous les droits
    if (rolePermissions[role].includes('all_permissions')) {
        return true;
    }

    // Sinon, vérifie si la permission est dans la liste des permissions du rôle
    return rolePermissions[role].includes(permission);
};

// Fonction pour obtenir toutes les permissions d'un rôle
const getPermissionsForRole = (role) => {
    if (!role || !rolePermissions[role]){
        return [];
    }
    return [...rolePermissions[role]];
};

// Obtenir tous les rôles disponibles
const getAllRoles = () => Object.keys(rolePermissions);

// Vérifie s un rôle existe dans le système
const isValidRole = (role) => {
    return getAllRoles().includes(role);
};

// Vérifie si un USER a accès à une fonctionnalité qui nécessite une permission spécifique

const checkAccess = (user, permission) => {
    if(!user || !user.role) {
        return false;
    }
    return hasPermission(user.role, permission);
};

module.exports = {
    rolePermissions,
    hasPermission,
    getPermissionsForRole,
    getAllRoles,
    isValidRole,
    isValidPermission,
    checkAccess
};
