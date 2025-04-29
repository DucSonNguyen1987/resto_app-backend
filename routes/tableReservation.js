const express= require ('express');
const router = express.Router();

// Modèles 
const TableReservation = requre('../models/Tablereservations.js');
const Table = require ('../models/tables.js');
const User = requre ('../models/users.js');

// Middlewares
const authenticateToken = require('../middlewares/authMiddleware.js');
const {requirePermission, hasPermission} = require('../middlewares/roleMiddleware.js');
const {checkBody} = require ('../modules/checkBody.js');


/**
 * Obtenir toutes les réservations (avec filtres optionnels)
 * GET /reservations?date=2023-01-01&status=confirmed
 * Nécessite: 'view_reservations'
 */

router.get('/', authenticateToken, requirePermission('view_reservations'), async(req, res) => {
    try {
        const { date, status, user, table, floorPlan} = req.query;

        // Construire les critères de filtrage
        const filter = {};

        // Filtrer par date (Début à fin de journée)
        if(date) {
            const startDate = new Date(date);
            startDate.setHours(0,0,0,0);

            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            filter.startTime = { $gte :startDate, $lte: endDate};
        }

        // Filtrer par statut
        if(status && ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'].includes(status)) {
            filter.status = status;
        }

        // Filtrer par USER
        if(user){
            filter.user = user;
        }

        // Filtrer par table
        if(table) {
            filter.tables = table;
        }

        // Filtrer par plan de salle
        if(floorPlan) {
            filter.floorPlan = floorPlan;
        }

        // Récupérer les réservations avec les filtres
        const reservations = await TableReservation.find(filter)
        .populate ('user', 'username firstname lastname email phone')
        .populate ('tables', 'number capacity')
        .populate ('floorPlan', 'name')
        .populate('createdBy', 'username')
        .populate ('lastModifiedBy', 'username')
        .sort( {startTime :1});

        res.json({ result: true, data: reservations});
    } catch(error) {
        console.error('Erreur lors de la récupérationd des réservations:', error)
        res.status(500).json({ result: false, error: 'Erreur serveur'});
    }
});


/**
 * Obtenir une réservation spécifique
 * GET /reservations/:reservationid
 * Nécessite: view_reservations ou être propriétaire de la réservation
 */

router.get('/:reservationId', authenticateToken, async(req, res) => {
    try {
        const {reservationId} = req.params;

        const reservation = await TableReservation.finById(reservationId)
        .populate ('user', 'username firstname lastname email phone')
        .populate ('tables', 'number capacity status')
        .populate ('floorPlan', 'name')
        .populate ('createdby', 'username firstname lastname')
        .populate ('lastModifiedby', 'username firstname lastname')

        if (!reservation) {
            return res.status(404).json({ result: false, error: 'Réservation non trouvée'})
        }

        // Vérifier si le USER est autorisé à voir cette réservation
        const canView = 
        req.user.role === 'ADMIN' ||
        req.user.role === 'OWNER' ||
        req.user.role === 'MANAGER' ||
        req.user.role === 'STAFF' ||
        (reservation.user && reservation.user._id.toString() === req.user._id.toString());

        if(!canView) {
            return res.status(403).json({
                result: false,
                error: 'Voun\'êtes pas autorisé(e) à consulter cette réservation'
            });
        }
        res.json({ result: true, data: reservation});
    } catch(error) {
        console.error(' Erreur lors de la récupération de la réservation', error)
        res.status(500).json({ result: false, error:'Erreur Serveur'})
    }
});

/**
 * Créer une nouvelle réservation
 * POST /reservations
 * Nécessite: create_reservation (pour les clients)
 */

router.post('/', authenticateToken, requirePermission('create_reservation'), async(req, res) => {
    try {
        const { startTime, endTime, tables, floorPlan, guests, specialOccasion, specialoccasionDetails, notes, customerInfo } = req.body;


        // Check les champs obligatoires

        if(!checkBody(req.body, ['startTime','endTime', 'tables', 'floorPlan', 'guests'])) {
            return res.status(400).json({
                result: false,
                error: 'informations obligatoires manquantes'
            });
        }

        // Si le User est un simple client et qu'il n'a pas fourni ses informations

        if( req.user.role === 'USER' && !customerInfo && !req.user) {
            return res.status(400).json({
                result: false,
                error: 'Informations client obligatoires'
            });
        }

        // Check si les tables existent
        const  tableIds = Array.isArray(tables) ? tables : [tables];
        const existingTables = await Table.find( {_id: {$in: tableIds}});

        if(existingTables.length !== tableIds.length) {
            return res.status(400).json({
                result: false,
                error :'Une ou plusieurs tables n\'existent pas.'
            });
        }

        // Créer une nouvelle réservation

        const newReservation = new TableReservation({
            startTime : new Date(startTime),
            endTime : new Date (endTime),
            tables : tableIds,
            floorPlan,
            guests,
            specialOccasion: specialOccasion || false,
            specialoccasionDetails,
            notes,
            user : req.user._id,
            customerInfo : req.user.role === 'USER' ? null : customerInfo,
            status : req.user.role === 'USER' ? 'pending' : 'confirmed', // Les réservations prises par le staf sont confirmées par défault
            createdby : req.user._id,
            lastModifiedBy: req.user._id
        });

        // Sauvegarder la réservation
        await newReservation.save();

        // MAJ du statut des tables si la réservation est confirmée
        if(newReservation.status === 'confirmed') {
            await Table.updateMany(
                {_id: {$in: tableIds}},
                {$set: {status: 'reserved'}}
            );
        }

        res.status(201).json({
            result: true,
            message :'Réservation créée avec succès',
            data: newReservation
        });
        } catch (error) {
            // Gérer spécifiquement l'erreur de conflit de réservation
            if(error.message && error.message.includes ('déjà réservées')) {
                return res.status(409).json({
                    result: false,
                    error: error.message,
                    conflictingReservations : error.conflictingReservations
                });
            }

            console.error('Erreur lors de la création de la réservation:', error);
            res.status(500).json({ result: false, error: 'Erreur serveur'});
        }
    });

    /**
     * Modifier une réservation existante
     * PUT /reservations/:reservationId
     * Nécessite : edit_reservation ou être propriétatire de la réservation
     */

    router.put('/:reservationId', authenticateToken, async(req, res) => {
        try {
            const { reservationId} =req.params;
            const { startTime, endTime, tables, guests, specialOccasion, specialoccasionDetails, notes, status} = req.body;

            // Trouver la réservation
            const reservation = await TableReservation.findById(reservationId);

            if(!reservation) {
                return res.status(404).json({ result: false, error : 'Réservation non trouvée'})
            }

            // Vérifier les autorisations 
            const isOwner = reservation.user && reservation.user.toString() === req.user._id.toString();
            const canEdit = req.user.role === 'ADMIN' || req.user.role === 'OWNER' || req.user.role === 'MANAGER' || isOwner;

            if(!canEdit) {
                return res.status(403).json({
                    result: false,
                    error: 'Vous n\'êtes pas autorisé(e) à modifier cette réservation'
                });
            }

            // les clients ne peuvent pas changer le statut
            if(status && req.user.role === 'USER' && !hasPermission(req.user.role, 'edit_reservation')) {
                return res.status(403).json({
                    result: false,
                    error: 'Vous n\êtes pas autorisé(e) à changer le statut de la réservation'
                });
            }

            // MAJ des champs 
            if (startTime) reservation.startTime = new Date(startTime);
            if(endTime) reservation.endTime = new  Date(endTime);
            if(guests) reservation.guests = guests;
            if (specialOccasion) reservation.specialOccasion = specialOccasion;
            if(specialoccasionDetails !== undefined) reservation.specialoccasionDetails = specialoccasionDetails;
            if(notes !== undefined) reservation.notes = notes;

            // Changement de tables
            if (tables) {
                const tableIds = Array.isArray(tables) ? tables : [tables];

                // Vérifier que les tables existent 
                const existingTables = await Table.find( { _id: {$in: tableIds}});

                if(existingTables.length !== tableIds.length) {
                    return res.status (400).json({
                        result : false,
                        error :'Une ou plusieurs tables spécifiées n\'existent pas'
                    });
                }

                reservation.tables = tableIds;
            }

            //Enregistrer qui a fait la modification
            reservation.lastModifiedBy = req.user._id;

            // Sauvegarder les modifications
            await reservation.save();

            // MAJ le statut des tables
            if(reservation.status === 'confirmed'){
                await Table.updateMany(
                    {_id: {$in:reservation.tables}},
                    {$set : {status : 'reserved'}}
                );
            } else if ( reservation.status === 'cancelled' || reservation.status === 'completed') {
                // Libérer les tables
                await Table.updateMany(
                    {_id: {$in:reservation.tables}},
                    {$set: {status: 'free'}}
                );
            }
            res.json({
                result: true,
                message : 'Réservation mise à jour avec succès',
                data: reservation
            });
        } catch(error) {
            // gérer spécifiquement l'erreur de conflit de réservation
            if(error.message && error.message.includes('déjà réservées')) {
                return res.status(409).json({
                    result: false,
                    error: error.message,
                    conflictingReservations: error.conflictingReservations
                });
            }
            console.error('Erreur lors de la modification de la réservation', error);
            res.status(500).json({ result: false, error: 'Erreur serveur'})
        }
    });

    /**
     * Annuler une réservation
     * PATCH /reservations/:reservationId/cancel
     * Nécessite : 'cancel_reservation' ou être propriétaire 
     */

    router.patch('/:reservationId/cancel', authenticateToken, async(req, res) => {
        try {
            const { reservationId } = req.params;
            const { reason } = req.body;

            // Trouver la réservation
            const reservation = await TableReservation.findById(reservationId);

            if(!reservation) {
                return res.status(404).json({result: false, error: 'Réservation non trouvée'});
            }

            // Vérifier les autorisations
            const isOwner = reservation.user && reservation.user.toString() === req.user._id.toString();
            const canCancel = req.user.role === 'ADMIN' || req.user.role === 'OWNER' || req.user.role === 'MANAGER' || (isOwner && hasPermission(req.user.role, 'cancel_reservation'));

            if(!canCancel) {
                return res.status(403).json({
                    result: false,
                    error: 'Vous n\'êtes pas autorisé(e) à annuler cette réservation'
                });
            }

            // Check si la réservation n'est pas déjà annulée ou terminée

            if(['cancelled', 'completed', 'no-show'].includes(reservation.status)) {
                return res.status(400).json({
                    result: false,
                    error :`Cette réservation est déjà ${reservation.status === 'cancelled' ? 'annulée' : 'terminée'}`
                });
            }

            // MAJ du statut et les notes
            reservation.status = 'cancelled';
            if(reason) {
                reservation.notes = reservations.notes ? `${reservation.notes}\nAnnulation: ${reason}}` : `Annulation: ${reason}`;
            }

            // Enregistrer qui a fait la modification
            reservation.lastModifiedBy = req.user._id;

            // Sauvegarder les modifications
            await reservation.save();

            // Libérer les tables
            await Table.updateMany(
                {_id: {$in: reservation.tables}},
                {$set: {status: 'free'}}
            );

            res.json({
                result: true,
                message: 'Réservation annulée avec succès',
                data: reservation
            });
        } catch(error) {
            console.error('Erreur lors de l\'annulation de la réservation:', error)
            res.status(500).json({ result: false, error: 'Erreur serveur'})
        }
    });

    /**
     * Confirmer une réservation
     * PATCH /reservations/:reservationId/confirm
     * Nécessite :'edit_reservation'
     */

    router.patch('/:reservationId/confirm', authenticateToken, requirePermission('edit_reservation'), async(req, res) => {
        try {
            const {reservationId} = req.params;

            // Trouver la réservation
            const reservation = await TableReservation.findById(reservationId);

            if(!reservation) {
                return res.status(404).json({result: false, error: 'Réservation non trouvée'});
            }

            // Vérifier que la réeservation est en attente
            if(reservation.status !== 'pending') {
                return res.status(400).json({
                    result: false,
                    error: `Cette réservation est déjà ${reservation.status}`
                });
            }

            // MAJ du statut
            reservation.status ='confirmed';

            // Enregistrer qui a fait la modification
            reservation.lastModifiedBy = req.user._id;

            // Save la modif
            await reservation.save();

            //MAJ du statut des tables
            await Table.updateMany(
                {_id: {$in: reservation.tables}},
                {$set: {status: 'reserved'}}
            );

            res.json({
                result: true,
                message: 'Réservation confirmée avec succès',
                data: reservation
            });
        } catch(error) {
            console.error('Erreur lors de la confirmation de la réservation', error);
            res.status(500).json({result: false, error:'Erreur serveur'})
        }
    });

    /**
     * Margquer une réservation comme complétée
     * PATCH /reservations/:reservationId/complete
     * Nécessite :'edit_reservation'
     */

    router.patch('/:reservationId/complete', authenticateToken, requirePermission('edit_reservation'), async(req, res) => {
        try {
            const { reservationId } = req.params;

            // trouver la réservation
            const reservation = await TableReservation.findById(reservationId);

            if(!reservation) {
                return res.status(404).json({result: false, error: 'Réservation non trouvée'});
            }

            // Vérifier que la réservation est confirmée
            if(reservation.status !== 'confirmed') {
                return res.status(400).json({
                    result: false,
                    error: `Cette réervation est ${reservation.status}, elle ne peut être marquée comme complétée.`
                });
            }
            // MAJ du statut
            reservation.status = 'completed';

            // Enregistrer qui a fait les modifications
            reservation.lastModifiedBy = req.user._id;

            // Sauvegarder les modifications
            await reservation.save();

            // Libérer les tables
            await Table.updateMany(
                {_id: {$in: reservation.tables}},
                {$set: {status: 'free'}}
            );

            res.json({
                result: true,
                message: 'Réservation marquée comme complétée',
                data: reservation
            });
        } catch(error) {
            console.error( 'Erreur lors du marqueage de la réservation comme complétée', error);
            res.status(500).json({result:false, error:'Erreur serveur'});
        }
    });

    /**
     * Marquer une réservation comme non présentée (no-show)
     * PATCH /reservations/:reservationId/no-show
     * Nécessite: 'edit_reservation'
     */

    router.patch('/:reservationId/no-show', authenticateToken, requirePermission('edit_reservation'), async(req, res) => {
        try {
            const { reservationId } = req.params;

            // trouver la réservation
            const reservation = await TableReservation.findById(reservationId);

            if(!reservation) {
                return res.status(404).json({result: false, error: 'Réservation non trouvée'});
            }

            // Vérifier que la réservation est confirmée
            if(reservation.status !== 'confirmed') {
                return res.status(400).json({
                    result: false,
                    error: `Cette réervation est ${reservation.status}, elle ne peut être marquée comme complétée.`
                });
            }
            // MAJ du statut
            reservation.status = 'no-show';

            // Enregistrer qui a fait les modifications
            reservation.lastModifiedBy = req.user._id;

            // Sauvegarder les modifications
            await reservation.save();

            // Libérer les tables
            await Table.updateMany(
                {_id: {$in: reservation.tables}},
                {$set: {status: 'free'}}
            );

            res.json({
                result: true,
                message: 'Réservation marquée comme non présentée',
                data: reservation
            });
        } catch(error) {
            console.error( 'Erreur lors du marqueage de la réservation comme non présentée', error);
            res.status(500).json({result:false, error:'Erreur serveur'});
        }
    });

    /**
     * Vérifier la disponibilité des tables pour une période
     * GET /reservations/availability?date=2023-01-01&startTime=18:00&endTime=20:00
     * Pas de permission requise
     */

    router.get('/availability', async(req, res) => {
        try {
            const { date, startTime, endTime, floorPlanId, guests} = req.query;

            // Vérifier les champs requis
            if(!date || !startTime || !endTime || !floorPlanId) {
                return res.status(400).json({
                    result: false,
                    error: 'Paramètres manquants : date, startTime, endTime et floorPlanId sont requis.'
                });
            }

            // Construire les dates de début et de fin 
            const startDateTime = new Date (`${date}T${startTime}`);
            const endDateTime = new Date (`${date}T${endTime}`);

            // Vérifier que les autres dates sont valides
            if (isNaN(startDateTime) || isNaN(endDateTime)) {
                return res.status(400).json({
                    result: false,
                    error: 'Format de date ou d\'heure invalide'
                });
            }

            // Vérifier que la période est cohérente
            if (endDateTime <= startDateTime) {
                return res.status(400).json({
                    result: false,
                    error: 'L\'heure de fin doit être après l\'heure de début'
                });
            }

            // Trouver toutes les tables du plan de salle spécifié
            const allTables = await Table.find( {floorPlan : floorPlanId});

            if (allTables.length === 0) {
                return res.status(404).json({
                    result: false,
                    error: 'Aucune table trouvée pour ce plan de salle'
                });
            }

            // Trouver toutes les réservations qui chevauchent la période demandée

            const existingReservations = await TableReservation.find({
                floorPlan : floorPlanId,
                status: { $in: ['pending', 'confirmed']},
                $or : [
                    // Début de nouvelle réservation pendant une existante
                    {startTime : {$lte : startDateTime}, endTime: {$gt: startDateTime}},
                    // Fin de nouvelle réservation pendant une existante
                    {startTime: {$lt: startDateTime}, endTime : {$gte: endDateTime}},
                    // Nouvelle réservation englobe une existante
                    {startTime: {$gte: startDateTime}, endTime: {$lte: endDateTime}}
                ]
            }).populate('tables', 'number capacity');

            // Identifier les tables disponibles 
            const availableTables = allTables.filter( table => !reservedTableIds.has(table._id.toString()) && (guests ? table.capacity >= parseInt(guests) : true));

            res.json({
                result : true,
                data : {
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    floorPlan :floorPlanId,
                    availableTables: availableTables,
                    totalTables : allTables.length,
                    availableTablesCount: availableTables.length
                }
            });
        } catch (error) {
            console.error ('Erreur lors de la vérification de disponibilité:', error);
            res.status(500).json({result: false, error: 'Erreur serveur'})
        }
    });

    /**
     * Obtenir les réservations d'un USER
     * GET /reservations/user/:userId
     * Nécessite: être le USER concerné ou avoir la permission 'view_reservations'
     */

    router.get('/user/:userId', authenticateToken, async(req, res)=> {
        try {
            const {userId} = req.params;

            // Check les permissions
            const isRequestingOwnReservations = userId === req.user._id.toString();
            const canViewAllReservations = req.user.role === 'ADMIN' || req.user.role === 'OWNER' || req.user.role === 'MANAGER' || req.user.role === 'STAFF';

            if(!isRequestingOwnReservations && !canViewAllReservations){
                return res.status(403).json({
                    result: false,
                    error: 'Vous n\'êtes pas autorisé(e) à consulter les réservations de cet utilisateur'
                });
            }

            // Récupérer les réservations
            const reservations = await TableReservation.find({user: userId})
            .populate('tables', 'number capacity')
            .populate('floorPlan', 'name')
            .sort({ startTime: -1}); // Les plus récentes d'abord

            res.json({ result: true, data: reservations});
        } catch(error){
            console.error('Erreur lors de la récupération des réservations utilisateur:', error);
            res.status(500).json({result :false, error: 'Erreur serveur'});
        }
    });

    module.exports = router;
    
