const mongoose = require ('mongoose');


const userSchema = mongoose.Schema({
    firstname : String,
    lastname : String,
    email : String,
    email : String,
    phone : String,
    password : String,
    accessToken :String,
    refreshToken :String,
    role: {
        type : String,
        enum: ['ADMIN', 'OWNER', 'MANAGER', 'STAFF', 'USER']
    }
});

const User = mongoose.model("users", userSchema)
module.exports = User;