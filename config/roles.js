
const rolePermissions = {
    ADMIN: [
        // Consultation
        'view_website',
        'view_catalog',
        'edit_profile',
        // Réservations
        'view_reservations',
        'create_reservation',
        'edit_reservation',
        'cancel_reservation',
        // Commandes
        'create_order',
        'edit_order',
        'cancel_order',
        // Menu
        'create_catalog_item',
        'edit_catalog_item',
        'delete_catalog_item',
        // Plan de salle
        'move_tables',
        'edit_floor_plan',
        'create_floor_plan',
        // Users
        'manage_users',
        // God mode
        'all_permissions'  // l'admin peut tout faire
    ],
    OWNER : [
        // Permissions explicites du OWNER
            
            // Plan de salle
            'edit_floor_plan',
            'create_floor_plan',
            
            // Users
            'manage_users',
            
        // Permissions héritées

            // Consultation
            'view_website',
            
            // Menu
            'view_catalog',
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

            // changement de table
            'move_tables'
    ],
    MANAGER : [
       // Permissions explicites du MANAGER
        
       // Menu
        'create_catalog_item',
        'edit_catalog_item',
        'delete_catalog_item',

        // Commandes
        'create_order',
        'edit_order',
        'cancel_order',

        // changement de tables
        'move_tables',

        // Plan de salle
        'edit_floor_plan',

        // Permissions héritées

            // Consultation
            'view_website',
            'view_catalog',
            'edit_profile',
            'view_reservations'

    ],
    STAFF : [
       // Permissions explicites de STAFF
            // Reservations
                'view_reservations',
            
            // Commandes
            'create_order',
            'edit_order',

        // Permissions de base
        'view_website',
        'view_catalog',
        'edit_profile'
    ],
    USER : [
        // Permissions explicites de USER
        'view_website',
        'view_catalog',
        'edit_profile',
        'create_reservation',
        'edit_reservation',
        'cancel_reservation'
    ]

};


// Fonction pour vérifier si un rôle a une permission spécifique
const hasPermission = (role, permission) => {
    if(!role || !rolePermissions[role]){
        return false
    }

    // Si le rôle est ADMIN, il a toutes les permissions
    if (role === 'ADMIN') {
        return true;
    }

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

module.exports = {
    rolePermissions,
    hasPermission,
    getPermissionsForRole,
    getAllRoles
};
