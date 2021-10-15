const assert = require('assert')
const { rpc } = require('../scripts/eos')
const { getContracts, getAccountBalance } = require('../scripts/eosio-util')
const { daosAccounts } = require('../scripts/daos-util')
const { assertError } = require('../scripts/eosio-errors')
const { contractNames, isLocalNode, sleep } = require('../scripts/config')
const { setParamsValue } = require('../scripts/contract-settings')
const { AssertionError } = require('assert')

const { daoreg, daoinf } = contractNames
const { firstuser, seconduser, thirduser, fourthuser } = daosAccounts

describe('Dao registry', async function(){
    let contracts;
    let daousers;

    before(async function(){
        if(!isLocalNode()){
            console.log('These test should only be run on local node')
            process.exit(1)
        }
        contracts = await getContracts([daoreg])
        daousers = [firstuser, seconduser, thirduser]
        await setParamsValue()
    })

    beforeEach(async function(){
        await contracts.daoreg.reset({authorization: `${daoreg}@active`})
    })

    it('Settings, set a new param', async function(){
        await contracts.daoreg.setparam(
            'testparam', 
            ['uint64', 20], 
            'test param', 
            {authorization: `${daoreg}@active`}
        )

        const settingParam = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'config',
            json: true,
            limit: 100
        })
        console.log(JSON.stringify(settingParam, null, 2))

        // aqui tambien asserts
    })

    it('Create DAO', async function(){
        await contracts.daoreg.create(
            'dao.org1',
            daoreg, 
            'HASH_1', 
            {authorization: `${daoreg}@active`}
        )

        let daoCreation = true;
        try{await contracts.daoreg.create(
            'dao.org2',
            firstuser,
            'HASH_2',
            {authorization: `${daoinf}@active`})
        daoCreation = false
        } catch (error){
            assertError({
                error,
                textInside:`missing authority of testuseraaa`,
                message: 'user must be have authorization (expected)',
                throwError: true
            })
        }

        const dao_table = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'daos',
            json: true,
            limit: 100
        })

        assert.deepStrictEqual(dao_table.rows, [
            {
                dao_id: 0,
                dao: 'dao.org1',
                creator: daoreg,
                ipfs: 'HASH_1',
                attributes: [],
                tokens: []
            }
        ])

        assert.deepStrictEqual(daoCreation, true)
    })

    it('Update IPFS DAO', async function(){
        // create DAO
        await contracts.daoreg.create(
            'dao.org1',
            daoreg,
            'HASH_1',
            {authorization: `${daoreg}@active`}
        )
        
        // update DAO by the creator
        await contracts.daoreg.update(
            0, 
            'NEW_HASH_1', 
            {authorization: `${daoreg}@active`}
        )
        
        // DAO cannot be updated by someone else
        let updateIpfsOnlyOwner = true
        try {
            await contracts.daoreg.update(
                0,
                'NEW_HASH_2',
                {authorization: `${daoinf}@active`})
            updateIpfsOnlyOwner = false
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry`,
                message: 'dao cannot be updated by someone else (expected)',
                throwError: true
            })
        }

        // Fails if DAO is not found
        let updateIpfsIfFound = true
        try {
            await contracts.daoreg.update(
                1,
                'NEW_HASH3',
                {authorization: `${daoreg}@active`})
            updateIpfsIfFound = false
        } catch (error) {
            assertError({
                error,
                textInside: "Organization not found",
                message: "DAO does not exists, can not be updated (expected)",
                throwError: true
            })
        }

        const dao_table = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'daos',
            json: true,
            limit: 100
        })

        assert.deepStrictEqual(dao_table.rows, [
            {
                dao_id: 0,
                dao: 'dao.org1',
                creator: daoreg,
                ipfs: 'NEW_HASH_1',
                attributes: [],
                tokens: []
            }
        ])

        assert.deepStrictEqual(updateIpfsOnlyOwner, true)
        assert.deepStrictEqual(updateIpfsIfFound, true)
    })

    it('Delete DAO', async function(){
        // create DAO
        await contracts.daoreg.create(
            'dao.org1',
            daoreg,
            'HASH_1',
            {authorization: `${daoreg}@active`}
        )

        // DAO can only be deleted by creator
        try {
            await contracts.daoreg.delorg(
                0,
                {authorization: `${daoinf}@active`}
            )
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry1`,
                message: 'users can not delete dao (expected)',
                throwError: true
            })
        }

        // Fails if DAO is not found
        try {
            await contracts.daoreg.delorg(
                1,
                { authorization: `${daoreg}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: "Organization not found",
                message: "DAO does not exists, can not be updated (expected)",
                throwError: true
            })
        }

        // delete DAO
        await contracts.daoreg.delorg(
            0,
            { authorization: `${daoreg}@active`}
        )
    })

    it('Upsert attributes', async function(){
        await contracts.daoreg.create(
            'dao.org1',
            daoreg,
            'HASH_1',
            { authorization: `${daoreg}@active` }
        )
    
        // add-modify attributes can only be done by creator 
        try {
            await contracts.daoreg.upsertattrs(
                0,
                [
                    { first: "first attribute", second: ['uint64', 001] },
                    { first: "second attribute", second: ['string', 'DAOO'] },
                ],
                { authorization: `${daoinf}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry1`,
                message: 'add or modify attributes can only be done by creator',
                throwError: true
            })
        }

        // Fails if DAO is not found
        try {
            await contracts.daoreg.upsertattrs(
                1,
                [
                    { first: "first attribute", second: ['uint64', 007] },
                    { first: "second attribute", second: ['string', 'this should fail'] },
                ],
                { authorization: `${daoreg}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: "Organization not found",
                message: "DAO does not exists, can not be updated (expected)",
                throwError: true
            })
        }
        
        // add some attributes
        await contracts.daoreg.upsertattrs(
            0,
            [
                { first: "first attribute", second: ['uint64', 001] },
                { first: "second attribute", second: ['string', 'DAOO'] },
            ],
            { authorization: `${daoreg}@active` }
        )

        // update attribute
        await contracts.daoreg.upsertattrs(
            0,
            [
                {first: "first attribute", second: ['string', 'updated attribute']}
            ],
            { authorization: `${daoreg}@active` }
        )

        const dao_table = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'daos',
            json: true,
            limit: 100
        })

        console.log(JSON.stringify(dao_table, null, 2))
        
    })

    it('Deletes attributes', async function(){
        // create DAO
        await contracts.daoreg.create(
            'dao.org1',
            daoreg,
            'HASH_1',
            { authorization: `${daoreg}@active` }
        )

        // add some attributes
        await contracts.daoreg.upsertattrs(
            0,
            [
                { first: "first attribute", second: ['uint64', 001] },
                { first: "second attribute", second: ['string', 'DAOO'] },
                { first: "third attribute", second: ['int64', -2] },
                { first: "fourth attribute", second: ['string', 'number 4'] },
            ],
            { authorization: `${daoreg}@active` }
        )
        // attributes can only be deleted by creator
        try { 
            await contracts.daoreg.delattrs(
                0,
                ['first attribute'],
                { authorization: `${daoinf}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry1`,
                message: 'attributes can only be deleted by creator',
                throwError: true
            })
        }

        // Fails if DAO is not found
        try {
            await contracts.daoreg.upsertattrs(
                1,
                [
                    { first: "first attribute", second: ['uint64', 007] },
                    { first: "second attribute", second: ['string', 'this should fail'] },
                ],
                { authorization: `${daoreg}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: "Organization not found",
                message: "DAO does not exists, can not be updated (expected)",
                throwError: true
            })
        }

        // delete attributes, fifth attribute does not exists
        await contracts.daoreg.delattrs(
            0,
            ['first attribute', 'fourth attribute', 'fifth attribute'],
            { authorization: `${daoreg}@active` }
        )

        const dao_table = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'daos',
            json: true,
            limit: 100
        })

        console.log(JSON.stringify(dao_table, null, 2))
    })

    it('Adds token correctly', async function(){
        // create DAO
        await contracts.daoreg.create(
            'dao.org1',
            daoreg,
            'HASH_1',
            { authorization: `${daoreg}@active` }
        )

        // Fails if DAO is not found
        try {
            await contracts.daoreg.addtoken(
                1,
                'token.c',
                `4,CTK`,
                { authorization: `${daoreg}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: "Organization not found",
                message: "DAO does not exists, can not be updated (expected)",
                throwError: true
            })
        }

        // add token can be done only by creator
        try {
            await contracts.daoreg.addtoken(
                0,
                'token.c',
                `4,CTK`,
                { authorization: `${daoinf}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry1`,
                message: 'token can be added only by creator (expected)',
                throwError: true
            })
        }

        // add token
        await contracts.daoreg.addtoken(
            0,
            'token.c',
            `4,CTK`,
            { authorization: `${daoreg}@active` }
        )

        // add token can not be done if the token is already added
        try {
            await contracts.daoreg.addtoken(
                0,
                'token.c',
                `4,CTK`,
                { authorization: `${daoreg}@active` }
            )
        } catch (error) {
            assertError({
                error,
                textInside: 'This token symbol is already added',
                message: 'can not add a token that is already added (expected)',
                throwError: true
            })
        }

        const dao_table = await rpc.get_table_rows({
            code: daoreg,
            scope: daoreg,
            table: 'daos',
            json: true,
            limit: 100
        })

        console.log(JSON.stringify(dao_table, null, 2))
    })

    it('Reset settings', async function () {
        await contracts.daoreg.resetsttngs({ authorization: `${daoreg}@active` })

        try {
            await contracts.daoreg.resetsttngs({ authorization: `${daoinf}@active` })
        } catch (error) {
            assertError({
                error,
                textInside: `missing authority of daoregistry1`,
                message: 'users can not reset settings (expected)',
                throwError: true
            })
        }
    })
})