const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Table = require('../models/tables');
const FloorPlan = require('../models/floorPlans');
const User = require('../models/users');
const jwt = require('jsonwebtoken');

// Variables pour stockage pendant les tests
let testUser;
let adminUser;
let testFloorPlan;
let testTable;
let adminToken;
let userToken;

// Configuration avant les tests
beforeAll(async () => {
    // Connexion à la base de données de test
    await mongoose.connect(process.env.TEST_DB_URI || 'mongodb://localhost:27017/restaurant-test');
    
    // Nettoyer les collections
    await Table.deleteMany({});
    await FloorPlan.deleteMany({});
    await User.deleteMany({});
    
    // Créer un utilisateur administrateur et un utilisateur standard pour les tests
    adminUser = await User.create({
        username: 'admin',
        firstname: 'Admin',
        lastname: 'User',
        email: 'admin@test.com',
        phone: '1234567890',
        password: 'adminpass',
        role: 'ADMIN'
    });
    
    testUser = await User.create({
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User',
        email: 'test@test.com',
        phone: '0987654321',
        password: 'testpass',
        role: 'USER'
    });
    
    // Générer des tokens JWT pour l'authentification
    adminToken = jwt.sign(
        { _id: adminUser._id, role: 'ADMIN' },
        process.env.JWT_SECRET_KEY || 'test_secret',
        { expiresIn: '1h' }
    );
    
    userToken = jwt.sign(
        { _id: testUser._id, role: 'USER' },
        process.env.JWT_SECRET_KEY || 'test_secret',
        { expiresIn: '1h' }
    );
    
    // Créer un plan de salle pour les tests
    testFloorPlan = await FloorPlan.create({
        name: 'Test Floor Plan',
        description: 'Plan for testing',
        dimensions: { width: 10, height: 10 },
        createdBy: adminUser._id,
        status: 'active'
    });
});

// Nettoyage après les tests
afterAll(async () => {
    await Table.deleteMany({});
    await FloorPlan.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
});

describe('Table API Tests', () => {
    // Test de création de table
    describe('POST /tables', () => {
        it('should create a new table when authenticated as admin', async () => {
            const response = await request(app)
                .post('/tables')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    number: 1,
                    capacity: 4,
                    position: { x: 2, y: 3 },
                    floorPlan: testFloorPlan._id
                });
            
            expect(response.status).toBe(201);
            expect(response.body.result).toBe(true);
            expect(response.body.data).toHaveProperty('number', 1);
            
            testTable = response.body.data;
        });
        
        it('should not allow regular users to create tables', async () => {
            const response = await request(app)
                .post('/tables')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    number: 2,
                    capacity: 2,
                    position: { x: 4, y: 4 },
                    floorPlan: testFloorPlan._id
                });
            
            expect(response.status).toBe(403);
        });
    });
    
    // Test de récupération des tables
    describe('GET /tables', () => {
        it('should return all tables when authenticated', async () => {
            const response = await request(app)
                .get('/tables')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });
        
        it('should return a specific table by ID', async () => {
            const response = await request(app)
                .get(`/tables/${testTable._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(response.body.data._id).toBe(testTable._id);
        });
        
        it('should filter tables by floor plan', async () => {
            const response = await request(app)
                .get(`/tables?floorPlan=${testFloorPlan._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
            expect(response.body.data[0].floorPlan._id).toBe(testFloorPlan._id.toString());
        });
    });
    
    // Test de mise à jour d'une table
    describe('PUT /tables/:tableId', () => {
        it('should update a table when authenticated as admin', async () => {
            const response = await request(app)
                .put(`/tables/${testTable._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    capacity: 6,
                    shape: 'rectangle',
                    dimensions: { width: 2, height: 1 }
                });
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(response.body.data.capacity).toBe(6);
            expect(response.body.data.shape).toBe('rectangle');
        });
        
        it('should not allow regular users to update tables', async () => {
            const response = await request(app)
                .put(`/tables/${testTable._id}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    capacity: 2
                });
            
            expect(response.status).toBe(403);
        });
    });
    
    // Test de déplacement d'une table
    describe('PATCH /tables/:tableId/position', () => {
        it('should update a table position when authenticated as admin', async () => {
            const response = await request(app)
                .patch(`/tables/${testTable._id}/position`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    position: { x: 5, y: 5 },
                    rotation: 45
                });
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(response.body.data.position.x).toBe(5);
            expect(response.body.data.position.y).toBe(5);
            expect(response.body.data.rotation).toBe(45);
        });
    });
    
    // Test de changement de statut d'une table
    describe('PATCH /tables/:tableId/status', () => {
        it('should update a table status when authenticated as admin', async () => {
            const response = await request(app)
                .patch(`/tables/${testTable._id}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    status: 'reserved'
                });
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            expect(response.body.data.status).toBe('reserved');
        });
    });
    
    // Test de suppression d'une table
    describe('DELETE /tables/:tableId', () => {
        it('should delete a table when authenticated as admin', async () => {
            const response = await request(app)
                .delete(`/tables/${testTable._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.result).toBe(true);
            
            // Vérifier que la table a bien été supprimée
            const checkTable = await Table.findById(testTable._id);
            expect(checkTable).toBeNull();
        });
    });
});