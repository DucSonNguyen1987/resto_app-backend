
const mongoose = require ('mongoose');


/**
 * Schema pour les réservations de tables
 * chaque réserveation possède :
 * - un client (ref à un USER ou infos de contact)
 * - une date et heure de début
 * - une date et heure de fin
 * - une ou plusieurs tables réservées
 * - un statut ( confirmée, en attente, annuméen no-show)
 * - des infos complémentaires (nombre de personnes, occasions spéciales)
 */

const tableReservationSchema = mongoose.Schema ({
    // Référence à un USER enregistré si disponible
    user :{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Infos du client (réservations sans compte)
    customerInfo : {
        name : {
            type: String,
            required: function() { return !this.user}  // Obligatoire si pas de référence USER
        },
        email : {
            type: String,
            required : function() { return !this.user}  // Obligatoire si pas de référence USER
        },
        phone : {
            type: String,
            required : function() { return !this.user}  // Obligatoire si pas de référence USER
        }
    },
    // Infos sur la réservation
    startTime : {
        type: Date,
        required: true
    },
    endTime : {
        type:  Date,
        required: true,
        validate : {
            validator : function(value){return value > this.startTime;},
            message: 'La date de fin doit être postérieure à la date de début'
        }
    },
    // Tables réservées
    tables : [{
        type: mongoose.Schema.Types.ObjectId,
        ref :'Table',
        required: true
    }],
    floorPlan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FloorPlan',
        required: true,
    },
    // Statut de la réservation
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
        default: 'pending'
    },
    // Informations supplémentaires
    guests: {
        type: Number,
        required: true,
        min: 1
    },
    specialOccasion: {
        type: Boolean,
        default: false
    },
    specialOccasionDetails : {
        type: String
    },
    notes: {
        type: String
    },
    // Métadonnées
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {timestamps: true});

// Vérifier que les tables ne sont pas déjà réervées sur la même plage horaire

tableReservationSchema.pre('save', async function(next) {
    // Ne vérifier que les réservations confirmed ou pending
    if(this.status === 'cancelled' || this.status === 'completed' || this.status === 'no-show') {
        return next();
    }

    const TableReservation = this.constructor;

    // Rechercher des réservations existantes que si chevauchent sur la même période
    const conflictingReservations = await TableReservation.find ({
        _id: {$ne: this._id},                           // Exclure la réservation actuelle
        tables : {$in: this.tables},                    // Au moins une table en commun
        status :{$in: ['pending', 'confirmed']},         // Ne vérifier que les réservations actives
        $or : [
            // Début de nouvelle réservation pendant une existante
            {startTime: {$lte : this.startTime}, endTime: {$gte : this.startTime}},
            // Fin de nouvelle réservation pendant une réservation existante
            {startTime: {$lte: this.endTime}, endTime: {$gte: this.endTime}},
            // Nouvelle réservation englobe une existante
            {startTime: {$gte:this.startTime}, endTime : {$lte: this.endTime}}
        ]
    });

    if (conflictingReservations.length > 0) {
        const error = new Error (`Une ou plusieurs tables sont déjà réservées sur cette plage horaire`);
        error.conflictingReservations = conflictingReservations;
        return next(error);
    }

    next();
});

const TableReservation = mongoose.model('TableReservation', tableReservationSchema);

module.exports = TableReservation;