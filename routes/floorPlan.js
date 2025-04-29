const express = requre ('express');
const router = express.Router();

// Modèles
const FloorPlan = require ('../models/floorPlan.js');
const Table = requre('../models/tables.js');

// Middlewares
const authentificateToken = require ('../middlewares/authMiddleware.js');
const { requirePermission} = require ('../middlewares/roleMiddleware.js');
const {checkBody} = require ('../modules/checkBody.js');

/**
 * Obtenir tous les plans de salle
 * GET /flooPlans
 * Nécessite: view_floor_plan
*/


router.get('/', authentificateToken, requirePermission('view_floor_plan'), async(req, res) => {
    try {
        const floorPlans = await FloorPlan.find()
        .populate('createdBy','username firstname lastname')
        .populate('lastModifiedBy','username firstname lastname')

        res.json({result: true, data: floorPlans})
    } catch( error) {
        console.error ('Erreur lors de la récupération des plans de salle')
        res.status(500).json({result: false, error : 'Erreur Serveur'});
    }
});

/**
 * Obtenir un plan de salle spécifique avec ses tables
 * GET /floorPlans/:floorPlanId
 * Nécessite: view_floor_plan
*/

router.get('/flooPlanId', authentificateToken, requirePermission('view_floor_plan'), async(req, res)=> {
    try {
        const { floorPlanId} = req.params;

        // Trouver le plan de salle
        const floorPlan = await FloorPlan.findById(floorPlanId)
        .populate('createdBy','username firstname lastname')
        .populate('lastModifiedBy','username firstname lastname')

        if( !floorPlan) {
            return res.status(404).json({ result: false, error : 'Plan de salle non trouvé'})
        }

        // Récupérer les tables associées à ce plan
        const tables = await Table.find({ floorPlan : floorPlanId })
        .populate( 'lastModifiedBy','username firstname lastname' );

        res.json({ 
            result : true,
            data : { floorPlan, tables}
        });
    } catch (error) {
        console.error ('Erreur lors de la récupération du plan de salle', error);
        res.status(500).json({ result: false, error: 'Erreur serveur'});
    }
});

/**
 * Créer un nouveau plan de salle
 * POST / floorPlan
 * Nécessite : 'create_floor_plan'
*/

router.post('/', authentificateToken, requirePermission('create_floor_plan'), async(req,res) => {
    try {
        // Vérifier les champs requis
        if(!checkBody(req.body, ['name', 'dimensions'])) {
            return res.status(400).json({ result :false, error :'Informations manquantes'})
        }

        const { name, description, dimensions, obstacles, status} = req.body;

        // Vérifier si le nom du plan n'existe pas déjà
        const existingPlan = await FloorPlan.find({name});

        if(existingPlan) {
            return res.status(400).json({ result :false , error : 'Ce nom de plan exsite déjà'});
        }

        // Créer un new Plan
        const newFloorPlan = new FloorPlan({
            name,
            description,
            dimensions,
            obstacles : obstacles || [],
            status: status || 'draft',
            createdBy: req.user._id,
            lastModifiedBy : req.user._id
        });

        // Sauver le plan dans la DB
        await FloorPlan.save();

        res.status(201).json({
            result: true,
            message :'Plan de salle créé avec succès',
            data :newFloorPlan
        });
    } catch( error) {
        consslor.error('Erreur lors de la création du plan de salle:', error);
        res.status(500).json({ result : false, error: 'Erreur serveur'})
    }
});

/**
 * Modifier un plan de salle existant
 * PUT /floorPlans/:floorPlanId
 * Nécessite: 'edit_floor_plan'
*/

router.put('/floorPlanId', authentificateToken, requirePermission('edit_floor_plan'), async(req, res) => {
    try {
        const {floorPlanId} = req.params;
        const { name, description, dimensions, obstacles, status} = req.body;

        // Récupérer le plan existant
        const floorPlan = await FloorPlan.findById(floorPlanId);
        if(!floorPlan) {
            return res.status(404).json({result :false, error: 'Plan de salle non trouvé'});
        }

        // Check si le USER peut modifier ce plan
        if (!floorPlan.canBeModifiedBy(req.user)) {
            return res.status(403).json({result: false, error : 'Vous n\'avez pas des doits de modifier ce plan '});
        }

        // Si le nom est changé, verifier qu'il ne soit pas déjà pris
        if (name && name !== floorPlan.name) {
            const existingPlan = await FloorPlan.findOne({neame, _id: {$ne : floorPlanId}});
            if(existingPlan) {
                return res.status(400).json({ result : false, error :'Ce nom de plan existe déjà'});
            }
            floorPlan.name =name;
        }

        // MAJ des champs modifiables
        if(description !== undefined) floorPlan.description = description;
        if(dimensions) floorPlan.dimensions = dimensions;
        if(obstacles) floorPlan.obstacles = obstacles;
        if(status) floorPlan.status = status;

        // Enregistrer qui a effectué la modification
        floorPlan.lastModifiedBy = req.user._id;

        // Sauvegarde des modifications
        await floorPlan.save();

        res.json({
            result : true,
            message : 'Plan de salle mis à jour avec succès',
            data : floorPlan
        })
    } catch(error) {
        console.error('Erreur lors de la modification du plan de salle: ', error)
        res.status(500).json( {result :false, error: 'Erreur serveur'})
    }
});

/**
 * Supprimer un plan de salle
 * DELETE /floorPlans/:floorPlanId
 * Necessite : 'edit_floor_plan
*/

router.delete('/:floorPlanId', authentificateToken, requirePermission('edit_floor_plan'), async(req, res)=> {
    try {
        const {floorPlanId} = req.params;

        // Check si le Plan existe
        const floorPlan = await FloorPlan.findById(floorPlanId);

        if( !floorPlan) {
            return res.status(404).json({ result: false, error :'Plan de salle non trouvé'});
        }

        // Check si le USER a la permission pour supprimer
        if(!floorPlan.canBeModifiedBy(req.user) && req.user.role !=='ADMIN') {
            return res.status(403).json( { result: false, error : 'Vous n\'avez pas les droits de supprimer ce plan'});
        }

        // Vérifier si le plan  a des tables associées

        const tablesCount = await Table.countDocument( {floorPlan: floorPlanId});

        if( tablesCount > 0 ) {
            return res.status(400).json({
                result: false,
                error : 'Ce plan contient des tables. Veuillez d\'abord supprimer ou déplacer ces tables.'
            });
        }

        // Suppression du plan
        await FloorPlan.findByIdAndDelete(floorPlanId);

        res.json({
            result: true,
            message: 'Plan de salle supprimé avec succès'
        });
    } catch( error) {
        console.error('Erreur lors de la suppression du plan de salle');
        res.status(500).json({ result: false, error :'Erreur serveur'})
    }
});

/**
 * Changer le statut d'un plan de salle
 * PATCH /floorPlans/:floorPlanId/status
 * Nécessite : 'edit_floor_plan'
 */

router.patch('/:floorPlanId/status', authentificateToken, requirePermission('edit_floor_plan'), async(req, res) => {
    try {
        const {floorPlanId} = req.params;
        const {status} = req.body;

        // Check si le statut est valide
        if(!status || !['active', 'inactive', 'draft'].includes(status)) {
            return res.status(400).json({
                result: false,
                error :'Statut invalide. Les valeurs acceptées sont: active, inactive et draft' 
            });
        }

        // Trouver et MAJ le plan
        const floorPlan = await FloorPlan.findById(floorPlanId);

        if(!floorPlan) {
            return res.status(404).json({ result : false, error :'Plan de salle non trouvé'});
        }

        // Check les permissions
        if (!floorPlan.canBeModifiedBy(req.user)) {
            return res.status(403).json({
                result: false,
                error : 'Vous n\'avez pas le droit de modifier ce plan '
            });
        }

        // MAJ du statut
        floorPlan.status = status;
        floorPlan.lastModifiedBy = req.user._id;
        await floorPlan.save();

        res.json({
            result: true,
            message :`Le statut du plan a été changé en ${status}`,
            data : floorPlan
        });
    } catch (error) {
        console.error('Erreur lors du changement de statut du plan')
        res.status(500).json ({ result: false, error : 'Erreur serveur'})
    }
});

/**
 * Ajouter ou modifier un obstacle dans le plan
 * POST /floorPlans/:floorPlanId/obstacles
 * Necessite 'exit_floor_plan'
*/

router.post('//:floorPlanId/obstacles', authentificateToken, requirePermission('edit_floor_plan'), async(req, res) => {
    try {
        const {floorPlanId} = req.params;
        const { obstacles} = req.body;

        // Vérifier les données
        if(!obstacles || Array.isArray(obstacles)) {
            return res.status(400).json({ result :false, error : 'Format d\'obstacle invalide'});
        }

        // Trouver le plan
        const floorPlan = await FloorPlan.findById(floorPlanId);
        if ( !floorPlan) {
            return res.status(404).json({ result :false, error : 'Plan de salle non trouvé'});
        }

        // Vérifier les permissions
        if(!floorPlan.canBeModifiedBy(req.user)) {
            return res.status(403).json({ result :false, error : 'Vous n\'avez pas la permission pour modifier ce plan'});
        }

        // MAJ des obstacles
        floorPlan.obstacles = obstacles;
        floorPlan.lastModifiedBy = req.user._id;
        await floorPlan.save();

        res.json({
            result :true,
            message :'Obstacles mis à jour avec succès',
            data : floorPlan
        });
    } catch(error) {
        console.error('Erreur lors de la mise à jour des obstacles')
        res.status(500).json ({ result :false, error: 'Erreur Serveur'})
    }
});

module.exports = router;



