const mongoose = require('mongoose');

/**
* Schéma pour le plan de salle de l'établissement
Chaque plan possède: 
- un nom unique
- une description
- des dimensions
- le proporiétaire qui l'a créé
- un statut
- la liste des obstacles (murs, piliers, etc...) avec leurs positions 
*/

const floorPlanSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description : {
        type: String,
        trim: true
    },
    dimensions: {
        width: {
            type: Number,
            required: true,
            min: 1
        },
        height: {
            type: Number,
            required: true,
            min: 1
        },
        unit : {
            type: String,
            default: 'meters'
        }
    },
    status : {
        type: String,
        enum :['active', 'inactive', 'draft'],
        default : 'draft'
    },
    createdBy : {
        type :monggose.Schema.Types.ObjectId,
        ref: 'User',
    },
    obstacles : [{
        type: {
        type: String,
        enum: ['wall', 'pillar', 'door', 'window', 'bar', 'service', 'stairs', 'other'],
        required :true
        },
        position : {
            x : {type: Number, required: true},
            y : {type: Number, required: true}
        },
        dimensions : {
            width : {type: Number, required: true},
            height : {type: Number, required: true}
        },
        rotation : {
            type: Number,
            default: 0
        },
        color : {
            type: String,
            default: '#808080'
        },
        label: String
    }]
},{timestamps : true,
    toJSON : {virtuals: true},
    toObject : {virtuals: true}
});

// Virtuel pour obtenir le nombre de tables dans ce plan
floorPlanSchema.virtual('tables',{
    ref: 'Table',
    localField: '_id',
    foreignField : 'floorPlan',
    count: true
});

// Methode pour vérifier si un USER peut modifier le plan

floorPlanSchema.methods.canbeModifiedBy = function(user){
    // si le USER est le créateur du plan ou a des permissions admin
    return ( this.createdBy.equals(user._id) || user.role === 'ADMIN' || user.role === 'OWNER' );
};

const FloorPlan = mongoose.model('FloorPlan', floorPlanSchema);

module.exports = FloorPlan;

