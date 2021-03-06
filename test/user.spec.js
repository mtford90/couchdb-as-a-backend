var assert = require('chai').assert,
    Potato = require('../potato');

describe('User management', function () {

    var db, potato;

    beforeEach(function (done) {
        potato = new Potato();
        potato.reset(function (err) {
            assert.notOk(err);
            potato.getOrCreateDatabase('db', function (err, _db) {
                assert.notOk(err);
                db = _db;
                done();
            });
        });
    });

    describe('create user', function () {

        it('returns a user document', function (done) {
            var username = 'mike',
                password = 'mike';
            potato.accounts.register({
                username: username,
                password: password
            }, function (err, user) {
                assert.notOk(err);
                assert.ok(user);
                assert.equal(user.name, 'mike');
                assert.ok(user._id);
                assert.ok(user._rev);
                done();
            });
        });

        describe('if auth method is specified, logs the user in', function () {
            it('basic', function (done) {
                var username = 'mike',
                    password = 'mike';
                potato.accounts.register({
                    username: username,
                    password: password,
                    auth: db.AUTH_METHOD.BASIC
                }, function (err) {
                    assert.notOk(err);
                    var auth = potato.auth.auth;
                    assert.ok(auth, 'auth should be set on successfuly user creation!');
                    assert.equal(auth.method, db.AUTH_METHOD.BASIC);
                    var user = auth.user;
                    assert.ok(user);
                    assert.equal(user.name, 'mike');
                    assert.equal(user.username, 'mike');
                    assert.equal(user.password, 'mike');
                    assert.ok(user._id);
                    assert.ok(user._rev);
                    assert.equal(auth.username, 'mike');
                    assert.equal(auth.password, 'mike');
                    done();
                });
            });
        });
    });

    describe('get user', function () {

        it('random user, should only be able to get the name', function (done) {
            var username = 'mike',
                password = 'mike';
            potato.accounts.register({
                username: username,
                password: password
            }, function (err) {
                assert.notOk(err);
                potato.accounts.logout(function (err) {
                    assert.notOk(err, 'unexpected error when logging out...');
                    potato.accounts.get('mike', function (err, doc) {
                        assert.ok(doc._id);
                        assert.ok(doc._rev);
                        assert.equal(doc.name, username);
                        done();
                    });
                });
            });
        });

        it('no user exists', function (done) {
            potato.accounts.get('mike', function (err, data) {
                assert.ok(err);
                done();
            });
        });
    });

    describe('current user', function () {
        it('user', function (done) {
            var username = 'mike',
                password = 'mike';
            potato.accounts.register({
                username: username,
                password: password,
                auth: potato.AUTH_METHOD.BASIC
            }, function (err, user) {
                assert.notOk(err);
                assert.ok(user);
                assert.equal(user, potato.accounts.user);
                console.log('user', user);
                done();
            });
        });

        it('auth', function (done) {
            var username = 'mike',
                password = 'mike';
            potato.accounts.register({
                username: username,
                password: password,
                auth: potato.AUTH_METHOD.BASIC
            }, function (err, user) {
                assert.notOk(err);
                assert.ok(user);
                assert.equal(user, potato.accounts.auth.user);
                assert.equal(potato.accounts.auth.method, potato.AUTH_METHOD.BASIC);
                done();
            });
        });

        it('logout should no longer return auth or user...', function (done) {
            var username = 'mike',
                password = 'mike';
            potato.accounts.register({
                username: username,
                password: password,
                auth: potato.AUTH_METHOD.BASIC
            }, function (err, user) {
                assert.notOk(err);
                assert.ok(user);
                potato.accounts.logout(function (err) {
                    assert.notOk(err);
                    assert.notOk(potato.accounts.auth);
                    assert.notOk(potato.accounts.user);
                    done();
                });
            });
        });
    });

    describe('auth', function () {

        describe('basic', function () {
            it('fail', function (done) {
                potato.accounts.login({
                    username: 'bob',
                    password: 'yo',
                    method: Potato.AUTH_METHOD.BASIC
                }, function (err) {
                    assert.ok(err, 'Should be an error');
                    assert.equal(err.status, db.HTTP_STATUS.UNAUTHORISED);
                    assert.notOk(potato.auth.auth);
                    done();
                })
            });
            function assertLoginSuccess(_authDict, username, password, user) {
                _authDict = potato.auth.auth;
                assert.equal(_authDict.method, potato.AUTH_METHOD.BASIC);
                assert.equal(_authDict.username, username);
                assert.equal(_authDict.password, password);
                assert.equal(_authDict.user.name, username);
                assert.equal(user.name, username);
                assert.equal(user.username, username);
                assert.equal(user.password, password);
            }

            describe('success', function () {
                it('login', function (done) {
                    var username = 'mike',
                        password = 'mike';
                    potato.accounts.register({
                        username: username,
                        password: password
                    }, function (err) {
                        assert.notOk(err);
                        var _authDict = potato.auth.auth;
                        assert.notOk(_authDict);
                        potato.accounts.login({
                            username: username,
                            password: password,
                            method: Potato.AUTH_METHOD.BASIC
                        }, function (err, user) {
                            assert.notOk(err);
                            assertLoginSuccess(_authDict, username, password, user);
                            done();
                        });
                    });
                });
                it('login.basic', function (done) {
                    var username = 'mike',
                        password = 'mike';
                    potato.accounts.register({
                        username: username,
                        password: password
                    }, function (err) {
                        assert.notOk(err);
                        var _authDict = potato.auth.auth;
                        assert.notOk(_authDict);
                        potato.accounts.login.basic({
                            username: username,
                            password: password
                        }, function (err, user) {
                            assert.notOk(err);
                            _authDict = potato.auth.auth;
                            console.log('auth', potato.auth.auth);
                            assert.ok(_authDict, 'should have logged them in');
                            assertLoginSuccess(_authDict, username, password, user);
                            done();
                        });
                    });
                });
            });


            it('logout', function (done) {
                var auth = potato.auth;
                auth.auth = {};
                assert.ok(auth.auth);
                potato.accounts.logout(function (err) {
                    assert.notOk(err, 'unexpected error when logging out...');
                    assert.notOk(auth.auth);
                    done();
                });
            });
        });
        describe('verify', function () {
            it('success', function (done) {
                var username = 'mike',
                    password = 'mike';
                potato.accounts.register({
                    username: username,
                    password: password,
                    auth: potato.AUTH_METHOD.BASIC
                }, function (err) {
                    assert.notOk(err);
                    potato.accounts.verifyAuth(function (err) {
                        assert.notOk(err);
                        done();
                    });
                });
            });
            it('failure if no user exists', function (done) {
                potato.auth = {
                    username: 'blah',
                    password: 'blah',
                    method: db.AUTH_METHOD.BASIC
                };
                potato.accounts.verifyAuth(function (err) {
                    assert.ok(err);
                    done();
                });
            });
            it('fail if no auth', function (done) {
                potato.accounts.verifyAuth(function (err) {
                    assert.ok(err);
                    done();
                });
            })
        });
    });
});