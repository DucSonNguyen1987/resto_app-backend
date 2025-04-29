const express = require('express');
const router = express.Router();

// Modèles
const Table = require('../models/tables.js');
const FloorPlan = require('../models/floorPlan.js');
const TableReservation = require('../models/TableTablereservations.js');

// middlewares
const authenticateToken = require('../middlewares/authMiddleware.js');
const { requirePermission } = require('../middlewares/roleMiddleware.js');
const { checkBody } = require('../modules/checkBody.js');


/**
 * Obtenir toutes les tables ( avec filtres optionnels)
 * GET /tables?floorPlan=id&status=free
 * Necessite 'view_floor_plan'
*/

router.get('/', authenticateToken, requirePermission('view_floor_plan'), async (req, res) => {
    try {
        const { floorPlan, status, minCapacity } = req.query;

        // Construire les critères de filtrage

        if (floorPlan) {
            filter.floorPlan = floorPlan;
        }

        if(status && ['free', 'reserved', 'occupied'].includes(status)){
            filter.status = status;
        }

        if (minCapacity && !isNaN(parseInt(minCapacity))) {
            FileSystemEntry.capacity = { $gte: parseInt(minCapacity) };
        }

        // Récupérer les tables avec les filtres
        const tables = await Table.find(filter)
        .populate('floorPlan', 'name')
        .populatte('lastModifiedBy', 'username firstname lastname')

        res.json({result :true , data: tables});
    } catch(error){
        console.error('Erreur lors de la récupération des tables:', error)
        res.status(500).json({result: false, error: 'Erreur Serveur'});
    }
});

/**
 * Obtenir une table spécifique 
 * GET /tables/:tableId
 * Nécessite : 'view_floor_plan'
*/
router.get('/:tableId', authenticateToken, requirePermission('view_floor_plan'), async(req, res) => {
try {
    const {tableId} = req.params;

    const table = await Table.findById(tableId)
    .populate('floorPlan', 'name dimensions')
    .populate ('lastModifiedBy', 'username firstanme lastname')

    if(!table) {
        return res.status(404).json({ result: false, error: 'Table non trouvée'});
    }
    res.json({result: true, data: table});
} catch(error){
    console.error('Erreur lors de la récupération des tables:', error)
    res.status(500).json({ result: false, error : 'Erreur serveur'})
}
});

/**
 * Créer une nouvelle table
 * POST /tables
 * Necessite 'edit_floor_plan'
*/

router.post('/', authenticateToken, requirePermission('edit_floor_plan'), async(req, res) => {
    try {
        // Vérifier les champs requis
        if(!checkBody(req.body, ['number', 'capacity', 'position', 'floorPlan'])) {
            return res.status(400).json({ result :false, error: 'Informations manquantes'})
        }

        const { number, capacity, shape, position, status, rotation, dimensions, floorPlan} = req.body;

        // Check si le plan de salle existe
        const existingPlan = await FloorPlan.findByid(floorPlan);
        if(!existingPlan){
            return res.status(400).json({result: false, error: ' Plan de salle non trouvé'});
        }

        // Check si le numéro de table n'est pas déjà pris
        const existingTable = await Table.findOne({number, floorPlan});
       
        if(existingTable){
            return res.status(400).json({
                result: false,
                error: ` La table n°${number} est déjà pris sur ce plan`
            });
        }

        // Créer la nouvelle table
        const newTable =new Table ({
            number,
            capacity,
            shape: shape || 'circle',
            position,
            status: status || 'free',
            rotation : rotation || 0,
            dimensions :dimensions || { width: 1 , height: 1},
            floorPlan,
            lastModifiedBy: req.user._id,
            lastModifiedAt: new Date()
        });

        // Sauvegarder la new table
        await newTable.save();

        res.status(201).json({
            result: true,
            message: 'Table créée avec succès',
            data: newTable
        });    
    } catch(error) {
        console.error('Erreur lors de la création de la table:', error);
        res.status(500).json({reult: false, error: 'Erreur serveur'})
    }
});

/**
 * Modifier une table existante
 * PUT /tables/:tableId
 * Necessite 'edit_floor_plan'
*/

router.put('/:tableId', authenticateToken, requirePermission('edit_floor_plan'), async(req,res) => {
    try {
        const {tableId} =req.params;
        const {number, capacity, shape, position, status, rotation, dimensions, floorPlan} = req.body;

        // Récupérer la table existante
        const table = await Table.findById(tableId);
        if(!table) {
            return res.status(404).json({result:false, error :'Table non trouvée'})
        }

        // Check si le numéro changé n'est pas déjà pris
        if((number && number !== table.number) || (floorPlan && floorPlan !== table.floorPlan.toString())){
            const checkFloorPlan = floorPlan || table.floorPlan;
            const checkNumber = number || table.number;

            const existingTable = await Table.findOne({
                number :checkNumber,
                floorPlan: checkFloorPlan,
                _id: { $ne: tableId}
            });

            if (existingTable) {
                return res.status(400).json({
                    result : false,
                    error :`La table n°${checkNumber} est déjà pris sur ce plan`
                });
            }
        }

        // Si on change le plan, vérifier qu'il existe
        if (floorPlan && floorPlan !== table.floorPlan.toString()) {
            const existingPlan = await FloorPlan.findById(floorPlan);

            if(!existingPlan) {
                return res.status(404).json({ result: false, error :'Plan de salle non trouvé'})
            }
        }

        // MAJ des champs modifiables
        if (number) table.number = number;
        if (capacity) table.capacity = capacity;
        if (shape) table.shape = shape;
        if(position) table.position = position;
        if(status) table.status = status;
        if(rotation !== undefined) table.rotation = rotation;
        if(dimensions) table.dimensions = dimensions;
        if(floorPlan) table.floorPlan = floorPlan;

        // enregistrer qui a fait la modification
        table.lastModifiedBy = req.user._id;
        table.lastModifiedAt = new Date();

        // Sauvegarder les modifications
        await table.save();

        res.json({
            result: true,
            message: 'Table mise à jour avec succès',
            data: table
        });
    } catch(error) {
        console.error('Erreur lors de la modification de la table:', error)
        res.status(500).json({ result: false, error : 'Erreur serveur'})
    }
});

/**
 * Supprimer une table
 * DELETE /tables/:tableId
 * Necessite 'edit_floor_plan'
*/

router.delete('/:tableId', authenticateToken, require('edit_floor_plan'), async(req, res) => {
    try {
        const { tableId} = req.params;

        // Check si la table existe
        const table = await Table.findById(tableId);

        if(!table) {
            return res.stauts(404).json({ result: false, error: 'Table non trouvée'})
        }

        // Check si la table a des reservations à venir

        const now = new Date();
        const futureReservations = TableReservation.find({
            tables :tableId,
            endTime : {$gt: now},
            status : { $in: ['pending', 'confirmed']}
        });

        if (futureReservations.length > 0){
            return res.status(400).json({
                result : false,
                error :'Cette Table a des réservations à venir. Veuillez d\'abord annuler ces réservations.',
                reservations : futureReservations
            });
        }

        // Supprimer la table
        await Table.findByIdAndDelelete(tableId);

        res.json ({
            result: true,
            mesage : 'Table supprimée avec succès'
        });
    } catch(error){
        console.error('Erreur lors de la suppression de la table:', error)
        res.status(500).json({result : false, error : 'Erreur serveur'})
    }
});

/**
 * Déplacer une table (MAJ sa position)
 * PATCH /tables/:tableId/position
 * Necessite 'move_tables'
 */

router.patch('/:tableID:position', authenticateToken, requirePermission('move_tables'), async(req, res) => {
    try {
        const {tabelId } = req.params;
        const { position, rotation} = req.body;

        // Veirfier les données 
        if(!position || typeof position.x !== 'number' || typeof position.y !=='number') {
            return res.status(400).json({
                result: false,
                error: 'Position invalide. Format attendu {x : number, y : number }'
            })
        }

        // Trouver la table
        const table = await Table.findById(tableId);
        if(!table) {
            return res.status(404).json({ result: false, error: 'Tables non trouvée'})
        }

        // MAJ la position et éventuellement la rotation
        table.position = position;
        if(rotation !== undefined) {
            table.rotation = rotation;
        }

        // Enregistrer qui a fait la modification
        table.lastModifiedBy = req.user._id;
        table.lastModifiedAt = new Date ();

        await table.save();

        res.json({
            result: true,
            message: 'Position de la table mise à jour',
            data: table
        });
    } catch( error) {
        console.error('Erreur lors du déplacement de la table:', error)
        res.status(500).json({ result: false, error: 'Erreur serveur'})
    }
});


/**
 * Changer le statut d'une table
 * PATCH /tables/:tableId/status
 * Necessite 'edit_reservation'
 */

router;patch('/:tableId/stauts', authenticateToken, requirePermission('edit_reservation'), async(req, res) => {
    try {
        const {tableId} = req.params;
        const {status} = req.body;

        // Check si le status est valide
        if(!status || !['free', 'occupied', 'reserved'].includes(status)) {
            return res.status(400).json({
                result : false,
                error: 'Statut Invalide. Les valeurs acceptées sont: free, reservd ou occupied'
            });
        }

        // Trouver et MAJ la table
        const table = await Table.findById(tableId);

        if(!table) {
            return res.stauts(404).json({ result: false, error: 'Table non trouvée'})
        }

        // MAJ du statut
        table.status = status;
        table.lastModifiedBy = req.user._id;
        table.lastModifiedAt = new Date();

        await table.save();
        res.json({
            result: true,
            message: `Les statut de la table a été changé en ${status}`,
            data: table
        });
    } catch( error) {
        console.error('Erreur lors du changement de statut de la table:', error)
        res.status(500).json({ result: false, error: 'Erreur serveur' });
    }
});

/**
 * Créer plusieurs tables d'un coup
 * POST tables/batch
 * Nécessite 'edit_floor_plan'
*/

router.patch('/batch', authenticateToken, requirePermission('edit_floor_plan'), async(req, res)=> {
    try {
        const {tables, floorPlanId} = req.body;

        // Check les données
        if(!tables || Array.isArray(tables) || tables.length ===0 ) {
            return res.status(400).json({
                result :false,
                error : 'Aucune table fournie'
            })
        }

        if(!floorPlanId) {
            return res.status(400).json({
                result: false,
                error :'L\'Id du plan de salle est obligatoire'
            });
        }

        // Vérifier que le plan existe
        const floorPlan = await FloorPlan.findById(floorPlanId);
        if(!floorPlan) {
            return res.status(404).json({
                result: false,
                error :'Plan de salle non trouvé'
            });
        }

        // Récupérer les numéros de table existants dans ce plan
        const existingTables = await Table.find( { floorPlan: floorPlanId}, 'number');
        const existingNumbers = existingTables.map(t => t.number);

        // vérifier les conflits de numéros
        const newNumbers = tables.map(t => t.number);
        const duplicateNumbers = newNumbers.filter((num, idx) => newNumbers.indexOf(num) !== idx || existingNumbers.includes(num));

        if (duplicateNumbers.length > 0 ) {
            return res.status(400).json({
                result: false,
                error :`Numéros de table en conflit: ${duplicateNumbers.join(', ')}`
            });
        }

        // Préparer les objets de table à créer
        const tablesToCreate = tables.map(table => ({
            ...table,
            floorPlan : floorPlanId,
            lastModifiedBy: req.user._id,
            lastModifiedAt: new Date()
        }));

        // Créer les tables
        const createdTables = await Table.insertMany(tablesToCreate);

        res.staut(201).json({
            result: true,
            message: `${createdTables.length} tables créées avec succès`,
            data: createdTables
        });
    } catch(error) {
        console.error('Erreur lors de la création ne masse des tables:', error)
        res.status(500).json({ result: false, error: 'Erreur serveur'})
    }
});

module.exports = router;

