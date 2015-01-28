(function () {

    var _ = require('nimble'),
        merge = require('merge');

    /**
     * Normalise the host parameter e.g. standardise forward slash, protocol etc.
     * @param host
     * @returns {*}
     */
    function normaliseHost(host) {
        host = host || 'http://localhost:5984';
        if (host.length) {
            if (host[host.length - 1] == '/') {
                host = host.substring(0, host.length - 1);
            }
        }
        return host.replace('http://', '');
    }

    function normaliseDb(db) {
        return db || 'db';
    }

    function isString(str) {
        return typeof str == 'string' || str instanceof String;
    }

    function isObject(o) {
        return typeof o == 'object';
    }

    var AUTH_METHOD = {
        BASIC: 'basic'
    };

    var MIME = {
        JSON: 'application/json'
    };

    var DEFAULT_ADMIN = 'admin';

    /**
     * @param arr
     * @constructor
     */
    function Set(arr) {
        arr.forEach(function (el) {
            this[el] = el;
        }.bind(this));
    }

    Set.prototype.memberOf = function (obj) {
        return obj in this;
    };

    var IGNORE_DATABASES = new Set(['_replicator']);

    /**
     * This module uses jquery ajax to provide full interaction with CouchDB as a backend.
     * @param [opts]
     * @param {String} [opts.host] - Base URL of CouchDB
     * @returns {Object}
     */
    var couchdb = function (opts) {
        opts = opts || {};

        var host = normaliseHost(opts.host),
            defaultDB = normaliseDb(opts.db);

        /**
         * Encapsulates auth strategy e.g. session, token. Used in every HTTP request to couch.
         */
        var auth = null;


        /**
         * Encapsulates errors produced whilst interacting with CouchDB over HTTP.
         *
         * @param opts
         * @param {String} [opts.message] - Error message
         * @param {jqXHR} [opts.xhr] - jqXHR object
         * @param {Error} [opts.thrown] - An Error object
         * @constructor
         */
        function CouchError(opts) {
            merge(this, opts);
            Object.defineProperty(this, 'isHttpError', {
                get: function () {
                    return !!this.xhr;
                }
            });
            Object.defineProperty(this, 'isThrownError', {
                get: function () {
                    return !!this.thrown;
                }
            });
            Object.defineProperty(this, 'isUserError', {
                get: function () {
                    return !this.isThrownError && !this.isHttpError;
                }
            })
        }

        /**
         * Configure the ajax options to match the configured authorisation method.
         * @param opts
         * @param [_auth] - override the configured auth method
         * @private
         */
        function _configureAuth(opts, _auth) {
            var a = _auth || auth;
            if (a) {
                var headers = opts.headers || {};
                opts.headers = headers;
                // Allow for authorization overrides.
                if (!headers.Authorization) {
                    if (a.method == AUTH_METHOD.BASIC) {
                        // Note: jQuery >=1.7 has username/password options. I do this simply for backwards
                        // compatibility.
                        headers.Authorization = 'Basic ' + btoa(a.username + ':' + a.password);
                    }
                }
            }
        }

        /**
         * Send a HTTP request
         * @param {Object} opts - The usual jquery opts +
         * @param {Object} opts.path - Path to append to host
         * @param {Function} [cb]
         * @private
         */
        function _http(opts, cb) {
            cb = cb || function () {
                // Do nothing.
            };
            opts = merge({
                type: 'GET',
                dataType: 'json',
                contentType: MIME.JSON
            }, opts || {});
            if (opts.contentType == MIME.JSON) {
                var data = opts.data;
                if (data) {
                    if (!isString(data)) {
                        opts.data = JSON.stringify(data);
                    }
                }
            }
            _configureAuth(opts);
            var path = opts.path || '';
            if (opts.path != null) delete opts.path;
            if (!opts.url) {
                var protocol = 'http://';
                opts.url = protocol + host + (path.length ? (path[0] == '/' ? '' : '/') : '') + path;
            }
            console.info('[CouchDB: HTTP Request]:', opts);
            $.ajax(opts).done(function (data, textStatus, jqXHR) {
                console.info('[CouchDB: HTTP Response]:', {
                    opts: opts,
                    jqXHR: jqXHR,
                    textStatus: textStatus,
                    status: jqXHR.status
                });
                cb(null, data);
            }).fail(function (jqXHR, textStatus, errorThrown) {
                console.info('[CouchDB: HTTP Response]:', {
                    opts: opts,
                    jqXHR: jqXHR,
                    textStatus: textStatus,
                    errorThrown: errorThrown,
                    status: jqXHR.status
                });
                if (errorThrown instanceof Error) {
                    cb(new CouchError({thrown: errorThrown}));
                }
                else {
                    cb(new CouchError({message: errorThrown, xhr: jqXHR, status: jqXHR.status, opts: opts}));
                }
            });
            return {cb: cb, opts: opts};
        }

        /**
         * Send a HTTP request or multiple http requests in parallel
         * @param {Object|Array} opts - The usual jquery opts, or an array of them.
         * @param {Object} [opts.path] - Path to append to host
         * @param {Function} [cb]
         */
        var http = function (opts, cb) {
            if (Array.isArray(opts)) {
                _.parallel(opts.map(function (_opts) {
                    return function (done) {
                        _http(_opts, done);
                    }
                }), cb);
            }
            else {
                _http(opts, cb);
            }
        };

        /**
         * Send a http request (or multiple http requests) as an admin.
         * @param {Object|Array} opts - The usual jquery opts, or an array of them.
         * @param {Object} [opts.path] - Path to append to host
         * @param [opts.username] - Admin username
         * @param [opts.password] - Admin username
         * @param cb
         */
        var adminHttp = function (opts, cb) {
            var adminOpts = {
                username: opts.username,
                password: opts.password
            };
            delete opts.username;
            delete opts.password;
            http(_configureAjaxOptsForAdmin(adminOpts, opts), cb);
        };

        /**
         * CouchDB has a weird convention for user identifiers. This function simply transforms the username into
         * to match that convention.
         * @param username
         * @returns {string}
         * @private
         */
        function _getFullyQualifedUsername(username) {
            return 'org.couchdb.user:' + username;
        }

        /**
         * @param opts
         * @param opts.username
         * @param opts.password
         * @param cb
         */
        var createUser = function (opts, cb) {
            var username = opts.username,
                password = opts.password;
            var fullyQualifiedUsername = _getFullyQualifedUsername(username);
            http({
                path: '_users/' + fullyQualifiedUsername,
                type: 'PUT',
                data: {
                    _id: fullyQualifiedUsername,
                    name: username,
                    type: 'user',
                    roles: [],
                    password: password
                }
            }, cb);
        };

        /**
         * The first time, an admin user can be created without any permissions. Subsequently, you must authenticate
         * as an another admin user
         * @param opts
         * @param opts.username
         * @param opts.password
         * @param cb
         */
        var createAdminUser = function (opts, cb) {
            var username = opts.username || DEFAULT_ADMIN,
                password = opts.password || DEFAULT_ADMIN;
            http({
                path: '_config/admins/' + username,
                type: 'PUT',
                data: '"' + password + '"'
            })
        };

        /**
         * Verify that username/password combination is correct by hitting the _session endpoint.
         * If this is the case, configure future authorisation method accordingly.
         * @param authOpts
         * @param authOpts.username
         * @param authOpts.password
         * @param cb
         */
        var basicAuth = function (authOpts, cb) {
            var username = authOpts.username,
                password = authOpts.password;
            var httpOpts = {
                path: '_session',
                type: 'POST',
                contentType: "application/x-www-form-urlencoded",
                data: 'name=' + username + '&password=' + password
            };
            http(httpOpts, function (err, data) {
                if (!err) {
                    if (data.ok) {
                        auth = {
                            method: AUTH_METHOD.BASIC,
                            username: username,
                            password: password,
                            user: data
                        };
                        cb();
                    }
                    else {
                        cb(new CouchError(data));
                    }
                }
                else {
                    cb(err);
                }
            });
        };

        /**
         * Configure the ajax options with admin username + password
         * @param ajaxOptsOrOpts
         * @param [ajaxOptsOrOpts.username]
         * @param [ajaxOptsOrOpts.password]
         * @param [ajaxOpts] - O
         * @private
         */
        function _configureAjaxOptsForAdmin(ajaxOptsOrOpts, ajaxOpts) {
            var opts;
            if (!ajaxOpts) {
                ajaxOpts = ajaxOptsOrOpts;
                opts = {};
            }
            else {
                opts = ajaxOptsOrOpts;
            }
            var authOpts = {
                method: AUTH_METHOD.BASIC,
                username: opts.username || DEFAULT_ADMIN,
                password: opts.password || DEFAULT_ADMIN
            };
            if (Array.isArray(ajaxOpts)) {
                ajaxOpts.forEach(function (_ajaxOpts) {
                    _configureAuth(_ajaxOpts, authOpts);
                })
            }
            _configureAuth(ajaxOpts, authOpts);
            return ajaxOpts;
        }

        function optsOrCallback(optsOrCb, cb) {
            var opts;
            if (optsOrCb instanceof Function) {
                cb = optsOrCb;
                opts = {};
            }
            else {
                opts = optsOrCb;
            }
            return {opts: opts, cb: cb};
        }

        /**
         * Public API providing access to the backing CouchDB instance.
         */
        var API;
        //noinspection JSCommentMatchesSignature,JSCommentMatchesSignature,JSValidateJSDoc
        API = {
            info: function (cb) {
                http({path: ''}, cb);
            },
            createUser: createUser,
            basicAuth: basicAuth,
            logout: function () {
                auth = null;
            },
            admin: {
                createAdminUser: createAdminUser,
                /**
                 * @param [opts]
                 * @param [opts.username]
                 * @param [opts.password]
                 * @param cb
                 */
                deleteAllUsers: function (opts, cb) {
                    http(_configureAjaxOptsForAdmin(opts, {
                        path: '_users/',
                        type: 'DELETE'
                    }), cb);
                },
                /**
                 * Clear out the database. Useful during testing.
                 * @param [optsOrCb]
                 * @param [optsOrCb.username] - admin username
                 * @param [optsOrCb.password] - admin password
                 * @param cb
                 */
                deleteAllDatabases: function (optsOrCb, cb) {
                    var __ret = optsOrCallback(optsOrCb, cb),
                        opts = __ret.opts;
                    cb = __ret.cb;
                    opts.path = '_all_dbs';
                    adminHttp(opts, function (err, data) {
                        if (err) cb(err);
                        else {
                            var ajaxOpts = data.reduce(function (memo, dbName) {
                                if (!IGNORE_DATABASES.memberOf(dbName)) {
                                    memo.push({
                                        type: 'DELETE',
                                        path: dbName
                                    });
                                }
                                return memo;
                            }, []);
                            adminHttp(ajaxOpts, cb);
                        }
                    });
                },

                /**
                 *
                 * @param doc
                 * @param opts
                 * @param opts.id
                 * @param [opts.remove]
                 * @param [opts.admin]
                 * @param [opts.database]
                 * @param cb
                 * @private
                 */
                _toggleDoc: function (doc, opts, cb) {
                    var _http = opts.admin ? adminHttp : http,
                        database = opts.database || defaultDB,
                        id = opts.id,
                        remove = opts.remove;
                    var path = database + '/' + id;
                    console.log('_http', _http);
                    _http(merge(true, opts, {
                        path: path
                    }), function (err, resp) {
                        var found = true;
                        if (err) {
                            if (err.status == API.HTTP_STATUS.NOT_FOUND) found = false;
                            else {
                                cb(err);
                                return;
                            }
                        }
                        if (remove && found) {
                            // delete it
                            path += '?rev=' + resp._rev;
                            _http(merge(true, opts, {
                                type: 'DELETE',
                                path: path
                            }), cb);
                        }
                        else if (!remove) {
                            // create or update it
                            if (found) doc._rev = resp._rev;
                            _http(merge(true, opts, {
                                type: 'PUT',
                                path: path,
                                data: doc
                            }), cb);
                        }
                        else {
                            // Nothing to do!
                            cb(null, resp);
                        }
                    })
                },


                /**
                 * Clear out the database. Useful during testing.
                 * @param [optsOrCb]
                 * @param [optsOrCb.username]
                 * @param [optsOrCb.password]
                 * @param cb
                 */
                reset: function (optsOrCb, cb) {
                    var __ret = optsOrCallback(optsOrCb, cb),
                        opts = __ret.opts;
                    cb = __ret.cb;
                    API.admin.deleteAllDatabases(opts, function (err) {
                        if (!err) API.logout();
                        cb(err);
                    });
                },

                /**
                 *
                 * @param [opts]
                 * @param [opts.anonymousUpdates]
                 * @param [opts.anonymousReads]
                 * @param [cb]
                 */
                configureDatabase: function (opts, cb) {
                    var tasks = [];
                    if (opts.anonymousUpdates != undefined) {
                        tasks.push(function (done) {
                            var doc = {
                                language: 'javascript',
                                validate_doc_update: function (new_doc, old_doc, userCtx) {
                                    if (!userCtx.name) {
                                        throw({forbidden: "Not Authorized"});
                                    }
                                }.toString()
                            };
                            API.admin._toggleDoc(doc, {
                                id: '_design/blockAnonymousUpdates',
                                remove: opts.anonymousUpdates,
                                admin: true
                            }, done);
                        });
                    }
                    if (opts.anonymousReads != undefined) {
                        tasks.push(function (done) {
                            var doc = {
                                language: 'javascript',
                                validate_doc_read: function (doc, userCtx) {
                                    if (!userCtx.name) {
                                        throw({forbidden: "Not Authorized"});
                                    }
                                }.toString()
                            };
                            API.admin._toggleDoc(doc, {
                                id: '_design/blockAnonymousReads',
                                remove: opts.anonymousReads,
                                admin: true
                            }, done);
                        });
                    }
                    _.parallel(tasks, cb);
                }
                , /**
                 *
                 * @param [optsOrCb]
                 * @param [optsOrCb.database]
                 * @param [optsOrCb.anonymousUpdates]
                 * @param [optsOrCb.anonymousReads]
                 * @param [optsOrCb.username]
                 * @param [optsOrCb.password]
                 * @param [cb]
                 */
                createDatabase: function (optsOrCb, cb) {
                    var __ret = optsOrCallback(optsOrCb, cb);
                    var opts = __ret.opts;
                    cb = __ret.cb;
                    opts.path = opts.database || defaultDB;
                    opts.type = 'PUT';
                    adminHttp(opts, function (err) {
                        if (!err) {
                            console.log('configureDatabase opts', opts);
                            this.configureDatabase(opts, cb);
                        } else cb(err);
                    }.bind(this));
                }
                ,

                /**
                 * @param [optsOrCb]
                 * @param [optsOrCb.database]
                 * @param [optsOrCb.username]
                 * @param [optsOrCb.password]
                 * @param [cb]
                 */
                getPermissions: function (optsOrCb, cb) {
                    var __ret = optsOrCallback(optsOrCb, cb);
                    var opts = __ret.opts;
                    cb = __ret.cb;
                    var database = opts.database || defaultDB;
                    opts.path = database + '/_security';
                    adminHttp(opts, cb);
                }

            },
            HTTP_STATUS: {
                UNAUTHORISED: 401,
                CONFLICT: 409,
                NOT_FOUND: 404,
                FORBIDDEN: 403
            },
            AUTH_METHOD: AUTH_METHOD,
            /**
             * Verify that the configuration is ok.
             * @param cb
             */
            verify: function (cb) {
                http({
                    path: defaultDB
                }, cb);
            },

            _upsertDocumentArguments: function (arguments) {
                var doc, opts, cb;
                if (isObject(arguments[0]) && isObject(arguments[1])) {
                    doc = arguments[0];
                    opts = arguments[1];
                    cb = arguments[2];
                }
                else if (isObject(arguments[0])) {
                    doc = arguments[0];
                    opts = {};
                    cb = arguments[1];
                }
                else {
                    doc = {};
                    opts = {};
                    cb = arguments[0];
                }
                cb = cb || function () {
                };
                return {doc: doc, opts: opts, cb: cb};
            },
            /**
             * Updates special fields in the couchdb doc given a response from couchdb.
             * @param doc
             * @param resp
             * @private
             * @returns {string|undefined} - validation error if appropriate
             */
            _updateDocWithResponse: function (doc, resp) {
                var newid = resp.id,
                    newrev = resp.rev;
                if (!newid) return 'No id in response';
                if (!newrev) return 'No rev in response';
                doc._id = newid;
                doc._rev = newrev;
            }, /**
             * Creates or updates a document. Uses PUT/POST appropriately.
             * @param [doc]
             * @param [opts]
             * @param [opts.merge] - If revision doesn't match, automatically merge the document.
             * @param [cb]
             */
            upsertDocument: function () {
                var args = this._upsertDocumentArguments(arguments),
                    doc = args.doc,
                    opts = args.opts,
                    cb = args.cb,
                    id, path;
                if (doc._id) {
                    id = doc._id;
                }
                path = opts.db || defaultDB;
                if (id) path += '/' + id;
                if (auth) {
                    if ('user' in doc) {
                        cb(new CouchError({message: 'the user field is reserved'}));
                        return;
                    }
                    doc.user = auth.user.name;
                }
                http({
                    path: path,
                    data: doc,
                    type: id ? 'PUT' : 'POST'
                }, function (err, resp) {
                    if (!err) {
                        var processedDoc = merge({}, doc);
                        err = this._updateDocWithResponse(processedDoc, resp);
                        cb(err, processedDoc, resp);
                    }
                    else {
                        var isConflict = err.status == API.HTTP_STATUS.CONFLICT,
                            shouldMerge = opts.conflicts == 'merge';
                        if (shouldMerge && isConflict) {
                            API._merge(doc, opts, cb);
                        }
                        else {
                            cb(err);
                        }
                    }
                }.bind(this));
            },



            /**
             * Will repeatedly hit CouchDB until doc has been merged (e.g. no conflict)
             * @param doc
             * @param opts
             * @param cb
             * @private
             */
            _merge: function (doc, opts, cb) {
                console.log('doc._id', doc);
                API.getDocument(doc._id, opts, function (err, resp) {
                    if (!err) {
                        delete doc._rev;
                        doc = merge(resp, doc);
                        // Try again now that _rev should be updated.
                        this.upsertDocument(doc, opts, cb);
                    } else cb(err);
                }.bind(this));
            },

            /**
             * Get document with id
             * @param _id
             * @param [optsOrCb]
             * @param [optsOrCb.database]
             * @param [cb]
             */
            getDocument: function (_id, optsOrCb, cb) {
                var __ret = optsOrCallback(optsOrCb, cb),
                    opts = __ret.opts;
                cb = __ret.cb;
                var database = opts.database || defaultDB;
                http({
                    path: database + '/' + _id
                }, cb);
            },

            getUser: function (username, cb) {
                var fullyQualifiedUsername = _getFullyQualifedUsername(username);
                http({
                    path: '_users/' + fullyQualifiedUsername
                }, cb);
            }
        };

        Object.defineProperty(API, 'auth', {
            get: function () {
                return auth;
            },
            set: function (_auth) {
                auth = _auth
            },
            configurable: false,
            enumerable: true
        });


        return API;

    };

    if (typeof window !== undefined) window.couchdb = couchdb;
    if (typeof module !== undefined) module.exports = couchdb;
})();

