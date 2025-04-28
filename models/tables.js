const mongoose = require('mongoose');

/*
*Schema pour une table dans l'établissement
Chaque table possède:
- un numéro unique
- un nombre de places
- une forme (circle, square, rectangle)
- son statut (libre, réservée, occupée)
- sa rotation (pour l'orientation dans le plan)
- des dimensions ( largeur, hauteur)
- plan de salle auquel elle appartient
*/

const tableSchema = mongoose.Schema({
    number : {
        type: Number,
        required: true
    },
    capacity : {
        type: Number,
        required: true
    },
    shape : {
        type : String,
        enum :['circle', 'square', 'rectangle', 'oval'],
        default: 'circle'
    },
    position : {
        x :{
            type: Number,
            required: true
        },
        y :{
            type: Number,
            required: true
        }
    },
    status :{
        type: String,
        enum: ['free', 'reserved', 'occupied'],
        default : 'free'
    },
    rotation : {
        type : Number,
        default: 0,
    },
    dimensions : {
        width : {
            type : Number,
            default : 1
        },
        height : {
            type: Number,
            default : 1
        }
    },
    floorPlan : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FloorPlan',
        required: true
    },
    lastModifiedby : {
        type : mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModifiedAt : {
        type: Date,
        default : Date.now
    }
}, {Timestamps : true});

// Création d'un index pour assurer l'unicité des numéros de tables au sein du même plan
tableSchema.index ({ number : 1, floorPlan: 1}, {unique: true});

const Table = mongoose.model('Table', tableSchema);

module.exports = Table;