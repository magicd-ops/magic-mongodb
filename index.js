/**
 * Create Class instance extends from MongoClient
 * Use url , options to connect to mongodb
 */
let { MongoClient, ObjectId } = require('mongodb');
let {v4: uuidv4} = require('uuid');

let databaseFunc = (databaseData) => new MongoDB(databaseData);

class MongoDB extends MongoClient {
    constructor({url, port, dbName, options, collections}){
        super();
        this.removeAllListeners(); // first of all , remove all exist events in _events
        // update this.s with new url and options to use on db connect
        if(!url) url = 'localhost';
        if(!port) port = '27017';
        if(!options) options = {};
        options.useUnifiedTopology = true; // used in newest version of mongodb
        if(!collections) collections = [];
        this.s.url = `mongodb://${url}:${port}`;
        this.s.options = options;
        this.opt = {
            dbName,
            collections
        };
        this.dbo = null;
        this.processCodes = []; // list of process codes that will add to name of created event listener
        this.dbConnect();
    }
    response(listener){
        if(this.processCodes.length){
            let currentCode = this.processCodes[0];
            this.processCodes.shift();
            this.addListener(`call-${currentCode}`, listener);
        }
    }
    /**
     * this function will check if db is ready and then call current func
     * @param {function} func It will return selected function
     */
    dbReady(func, data){
        setTimeout(() => {
            if(!this.dbo){
                this.dbReady(func, data);
            } else {
                func.call(this, ...data);
            }
        }, 100);
    }

    syncQuery(query){
        query = query ? query : {};
        if(query._id){
            query._id = ObjectId(query._id);
        }
        if(query.id){
            query._id = ObjectId(query.id);
            delete query.id;
        }
        return query;
    }

    async dbConnect(){
        await this.connect({}, err => {
            if(err) throw err;
        });
        this.dbo = this.db(this.opt.dbName); // select db and set to this.dbo
        // create tables from table list if not exist
        this.opt.collections.forEach(async collect => {
            const exists = await this.checkExist(collect);
            // check if table is not exist and create {collect} name of table
            if(!exists){
                await this.dbo.createCollection(collect, (err, res) => {
                    // create table successfully
                });
            }
        });
    }

    // check if table exist
    async checkExist(collectionName){
        return await(await this.dbo.listCollections().toArray()).findIndex((item) => item.name === collectionName) !== -1;
    }

    createCode(){
        let code = uuidv4();
        this.processCodes.push(code);
        return code;
    }

    emitCall(code, result){
        if(this.processCodes.indexOf(code) < 0){
            this.emit(`call-${code}`, result);
        } else {
            this.processCodes = this.processCodes.filter(c => c != code);
        }
    }

    /**
     * get data from db table ( this.dbo )
     * @param {string} collectionName Name of table
     * @param {object} options selected Query {query: ''}
    */
    async getData(collectionName, options){
        let code = this.createCode();
        if(this.dbo){
            if(!options) options = {};
            let { query, sort } = options;
            options.query = this.syncQuery(options.query);
            if(!query) query = {};
            if(!sort) sort = {};
            const exists = await this.checkExist(collectionName);
            if(exists){
                // get data from selected table with query ( use {} when should get all data)
                await this.dbo.collection(collectionName).find(query).sort(sort).toArray((err, result) => {
                    if(err) throw err;
                    this.emitCall(code, result);
                });
            } else {
                this.emitCall(code, false);
            }
        } else {
            // if db is not ready yet , will call dbReady until this.dbo is ready
            this.dbReady(this.getData, {collectionName, options});
        }
    }
    /**
     * 
     * @param {string} collectionName 
     * @param {any} data - it can be array of objects or a single object
     * @param {object} options 
     */
    async createData(collectionName, data, options = {}){
        let code = this.createCode();
        if(this.dbo){
            const exists = await this.checkExist(collectionName);
            if(exists){
                if(!data.length){
                    await this.dbo.collection(collectionName).insertOne(data, (err, result) => {
                        if(err) throw err;
                        this.emitCall(code, result.ops);
                    });
                } else {
                    await this.dbo.collection(collectionName).insertMany(data, (err, result) => {
                        if(err) throw err;
                        this.emitCall(code, result.ops);
                    });
                }
            } else {
                this.emitCall(code, false);
            }
        } else {
            // if db is not ready yet , will call dbReady until this.dbo is ready
            this.dbReady(this.createData, {collectionName, data, options});
        }
    }

    async updateData(collectionName, data, options = {}){
        let code = this.createCode();
        options.type = options.type ? options.type : 'one'; // one , many
        options.query = this.syncQuery(options.query);

        data = { $set: data };
        if(this.dbo){
            const exists = await this.checkExist(collectionName);
            if(exists){
                switch(options.type){
                    case 'one':
                        await this.dbo.collection(collectionName).updateOne(options.query, data, (err, {result}) => {
                            if(err) throw err;
                            this.emitCall(code, result);
                        });
                        break;
                    case 'many':
                        await this.dbo.collection(collectionName).updateMany(options.query, data, (err, {result}) => {
                            if(err) throw err;
                            this.emitCall(code, result);
                        });
                }
            } else {
                this.emitCall(code, false);
            }
        } else {
            // if db is not ready yet , will call dbReady until this.dbo is ready
            this.dbReady(this.updateData, {collectionName, data, options});
        }
    }
	
	async deleteData(collectionName, options = {}){
        let code = this.createCode();
        options.type = options.type ? options.type : 'one'; // one , many
        options.query = this.syncQuery(options.query);

        if(this.dbo){
            const exists = await this.checkExist(collectionName);
            if(exists){
                switch(options.type){
                    case 'one':
                        await this.dbo.collection(collectionName).deleteOne(options.query, (err, {result}) => {
                            if(err) throw err;
                            this.emitCall(code, result);
                        });
                        break;
                    case 'many':
                        await this.dbo.collection(collectionName).deleteMany(options.query, (err, {result}) => {
                            if(err) throw err;
                            this.emitCall(code, result);
                        });
                }
            } else {
                this.emitCall(code, false);
            }
        } else {
            // if db is not ready yet , will call dbReady until this.dbo is ready
            this.dbReady(this.deleteData, {collectionName, options});
        }
    }
}

module.exports = databaseFunc;