const mongoose = require ('mongoose');


const userSchema = mongoose.Schema({
    username : String,
    firstname : String,
    lastname : String,
    email : String,
    phone : String,
    password : String,
    accessToken :String,
    refreshToken :String,
    role: {
        type : String,
        enum: ['ADMIN', 'OWNER', 'MANAGER', 'STAFF', 'USER']
    },
    twoFactorSecret : {
        type : String,
        default : null
    },
    twoFactorEnable : {
        type : Boolean,
        default: null
    },
    twoFactorBackupCodes : {
        type: [String],
        default: []
    },
    tempToken :{
        type: String,
        default: null
    }
});

const User = mongoose.model("users", userSchema)
module.exports = User;