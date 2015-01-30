var assert = require('chai').assert,
    couchdb = require('../src/couchdb').couchdb,
    prettyJson = require('./util').prettyJson;


describe('attachments', function () {
    var couch = couchdb();
    beforeEach(function (done) {
        couch.admin.reset(function (err) {
            assert.notOk(err);
            couch.admin.createDatabase({anonymousUpdates: true, anonymousReads: true}, function (err) {
                assert.notOk(err);
                done();
            });
        });
    });
    describe('data', function () {
        it('put attachment', function (done) {
            couch.upsertDocument({x: 1}, function (err, doc) {
                assert.notOk(err);
                couch.putAttachment({
                    doc: doc,
                    data: 'xyz',
                    attName: 'myAttr',
                    mimeType: 'text/plain'
                }, function (err) {
                    assert.notOk(err);
                    done();
                });
            })
        });
        it('get attachment', function (done) {
            couch.upsertDocument({x: 1}, function (err, doc) {
                assert.notOk(err);
                couch.putAttachment({
                    doc: doc,
                    data: 'xyz',
                    attName: 'myAttr',
                    mimeType: 'text/plain'
                }, function (err) {
                    assert.notOk(err);
                    couch.getAttachment({
                        doc: doc,
                        attName: 'myAttr'
                    }, function (err) {
                        assert.notOk(err);
                        done();
                    });
                });
            })
        });
    });
    describe('ajax', function () {
        it('put attachment', function (done) {
            couch.upsertDocument({x: 1}, function (err, doc) {
                assert.notOk(err);
                couch.putAttachment({
                    doc: doc,
                    url: 'http://localhost:7682/front/test/data/blah.png',
                    attName: 'myAttr'
                }, function (err) {
                    assert.notOk(err);
                    done();
                });
            });
        });
    });

});