(function (root) {
    'use strict';

    var constants = require('./constants'),
        CouchError = require('./CouchError');

    /**
     * Store authorisation information.
     * @param {API} api
     * @param opts
     * @param opts.auth
     * @param opts.adminAuth
     * @constructor
     */
    function Auth(api, opts) {
        var auth = opts.auth;
        this.adminAuth = opts.adminAuth || {
            method: constants.AUTH_METHOD.BASIC,
            username: constants.DEFAULT_ADMIN,
            password: constants.DEFAULT_ADMIN
        };
        this.auth = auth;
        this.api = api;
        this._verify();
    }

    Auth.prototype = {
        setAuth: function (auth) {
            this.auth = auth;
            this.api.emit('auth', auth);
        },
        /**
         * Verify auth has been configured correctly. Throw an error if not.
         */
        _verify: function () {
            var auth = this.auth;
            if (auth) {
                if (auth.method) {
                    if (auth.method == constants.AUTH_METHOD.BASIC) {
                        if (!auth.username) {
                            throw new CouchError({message: 'Must specify username if using basic auth'});
                        }
                        if (!auth.password) {
                            throw new CouchError({message: 'Must specify password if using basic auth'});
                        }
                    }
                    else {
                        throw new CouchError({message: 'Unknown auth methid "' + auth.method + '"'});
                    }
                }
                else {
                    throw new CouchError({message: 'Must specify method in auth'});
                }
            }
        },
        logout: function () {
            this.setAuth(null);
        }
    };

    module.exports = function (api, opts) {
        return new Auth(api, opts);
    };
})(this);