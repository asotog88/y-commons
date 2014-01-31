/**
 * Utility to bind dom with javascript and viceversa, helping to avoid events attaching and data updates directly
 *
 * @class DomBind
 * @namespace Common
 * @extends Base
 * @module gallery-y-common-dombind
 * @constructor
 */
Y.namespace('Common');

var ATTRIBUTE_SELECTOR = '[{attributeName}]';
var LOOP_DATA_FILTER = '|';
var FILTER = ':';
var COMMA_SEPARATOR = ',';

var DATA_BIND_CHANGE_EVENT = 'data-{property}-changed';
var DATA_IS_BINDED = '-isbinded';
var TEMPLATE = '-template';
var LOG_PREFIX = '[Y.Common.DomBind] ';
var FIELD_TYPES = {
    'checkbox': 0,
    'radio': 1
};
var DATA_ARRAY = 'Array';
var SCOPE_VAR_TEMPLATE = 'var {scopeVarName} = scopeModel["{scopeVarName}"];';

Y.Common.DomBind = Y.Base.create('gallery-y-common-dombind', Y.Base, [], {

    /**
     * Initializer
     */
    initializer: function () {
        this._init();
    },

    /**
     *
     * Sets model property
     *
     * @method setModel
     * 
     * @param {String} key The model property key, often used in the html to define which model property will be bind
     * @param {Any} value New value that is going to be set in the model property
     * @param {Object} [scopeModel] Scope model and additional info, used in cases like, to set list elements when they are bind
     * @param  {Y.Node} [triggerElement] Element that triggered the setModel on field change
     *
     */
    setModel: function (key, value, scopeModel, triggerElement) {
        this._setModel(key, value, scopeModel);
        var uniqueKey = this._generateUniqueKey(key, scopeModel);
        this.fire(Y.Lang.sub(DATA_BIND_CHANGE_EVENT, {
            property: uniqueKey
        }), {
            newValue: value,
            triggerElement: triggerElement
        });
    },

    /**
     * Listens specific model changes
     * 
     * @method listen
     * 
     * @param {String} key The model property key of the property that is going to be listened
     * @param {Function} value The callback to execute on model property change
     * 
     */
    listen: function (key, callback) {
        this.on(Y.Lang.sub(DATA_BIND_CHANGE_EVENT, {
            property: key
        }), function (model) {
            callback(model);
        });
    },

    /**
     * Executes a controller method code expression 
     *
     * @method execControllerMethodExpression
     * 
     * @param {String} code Controller's method code to be executed e.g testFunc(test);
     * @param {Object} scopeModel The current scope model
     * @param {Y.Node} el Element which is where is defined the method call expression
     * 
     */
    execControllerMethodExpression: function (code, scopeModel, el) {
        var methodName = code.split('(')[0];
        eval(this._generateScopeVarsCode(scopeModel));
        eval(Y.Lang.sub('this.get("controller").{methodName} = Y.bind(this.get("controller").{methodName}, el);', {
            methodName: methodName
        }));
        eval('this.get("controller").' + code);
    },

    _init: function () {
        var me = this;
        this.after('modelChange', function () {
            Y.log(LOG_PREFIX + 'Model changed');
            me._compileDirectives({});
        });
    },

    /**
     *
     * Iterates over the available list of directives to start looking one by one in the dom
     *
     * @param {Object} scopeObject Scope unit of model and dom information basically contains the following structure
     *                 <code>{ scopeModel: Object, containerNode: Y.Node }</code>
     *
     */
    _compileDirectives: function (scopeObject) {
        for (var directive in Y.Common.DomBind.Directives) {
            if (Y.Common.DomBind.Directives.hasOwnProperty(directive)) {
                var directiveCfg = Y.Common.DomBind.Directives[directive];
                this._compileAndExecuteDirective(scopeObject, directive, directiveCfg);
            }
        }
    },

    /**
     * Looks for specific directive in the dom and executes it
     */
    _compileAndExecuteDirective: function (scopeObject, directiveName, config) {
        var me = this;
        var c = (scopeObject && scopeObject.containerNode) ? scopeObject.containerNode : this.get('container');
        var scopeModel = (scopeObject && scopeObject.scopeModel) ? scopeObject.scopeModel : {};
        var elements = c.all(Y.Lang.sub(ATTRIBUTE_SELECTOR, {
            attributeName: this._getDirectiveName(directiveName)
        }));
        var directiveExecFn = Y.bind(config.directiveExecFn, this);
        elements.each(function (el) {
            Y.clone(directiveExecFn)(directiveName, el,  el.getAttribute(me._getDirectiveName(directiveName)), Y.clone(scopeModel));
        });
    },


    /**
     * Retrieves the list of filters to be applied to the list directive iteration
     */
    _tokenizeFilters: function (filters) {
        var tokenizedFilters = [];
        for (var i = 0; i < filters.length; i++) {
            var filter = filters[i].split(FILTER);
            tokenizedFilters.push({
                name: filter[0],
                executeFn: filter[1]
            });
        }
        return tokenizedFilters;
    },

    /**
     * Applies filters that are going to be executed before each item inside of a list iteration
     */
    _doBeforeEachItem: function (filters, modelItem) {
        for (var i = 0; i < filters.length; i++) {
            if (filters[i].name == 'onBeforeEach') {
                var filterFunction = this.get('filters')[filters[i].executeFn];
                modelItem = filterFunction(modelItem);
            }
        }
        return modelItem;
    },

    /**
     * Applies filters that are going to be executed after each itemn iside of a list iteration, also passes the node created
     */
    _doAfterEachItem: function (filters, modelItem, node) {
        for (var i = 0; i < filters.length; i++) {
            if (filters[i].name == 'onAfterEach') {
                var filterFunction = this.get('filters')[filters[i].executeFn];
                modelItem = filterFunction(modelItem, node);
            }
        }
    },

    /**
     *
     * Sets the element value, takes care of the type of the element if its a form element sets its value if not, it sets the
     * inner html
     *
     * @param {Y.Node} el Element to be updated
     * @param {String} value New element value
     *
     */
    _setElementValue: function (el, value) {
        var nodeName = el.get('nodeName').toLowerCase();
        if (nodeName == 'input' || nodeName == 'textarea' || nodeName == 'select') {
            var fieldType = (typeof FIELD_TYPES[el.get('type')] == 'number') ? FIELD_TYPES[el.get('type')] : el.get('type');
            switch (fieldType) {
            case FIELD_TYPES['checkbox']:
                el.set('checked', value);
                break;
            case FIELD_TYPES['radio']:
                el.set('checked', (el.get('value') == value));
                break;
            default:
                el.set('value', value);
            }
        } else {
            el.set('innerHTML', value);
        }
    },

    /**
     * Gets form element value
     *
     */
    _getElementValue: function (el) {
        var nodeName = el.get('nodeName').toLowerCase();
        if (nodeName == 'input' || nodeName == 'textarea' || nodeName == 'select') {
            var fieldType = (typeof FIELD_TYPES[el.get('type')] == 'number') ? FIELD_TYPES[el.get('type')] : el.get('type');
            switch (fieldType) {
            case FIELD_TYPES['checkbox']:
                return el.get('checked');
            }
            return el.get('value');
        }
        return null;
    },

    /**
     *
     * Will generate javascript code as a string so then can be executed by eval function, will generated scope vars
     * so inline functions called from directives from the html can use any variable placed in the scope
     *
     * @param {Object} scopeModel Any scope model for example such as an item from a list iteration
     *
     */
    _generateScopeVarsCode: function (scopeModel) {
        var varsString = '';
        for (var scopeVarName in scopeModel) {
            if (scopeModel.hasOwnProperty(scopeVarName)) {
				/* verify if its array item or plain model item, then set with the current model data */
				var scopeItem = scopeModel[scopeVarName];
				if (scopeItem && scopeItem._info && scopeItem._info.parentType == DATA_ARRAY) {
					scopeModel[scopeVarName] = this.get('model')[scopeItem._info.parent][scopeItem._info.index];
				} else {
					scopeModel[scopeVarName] = this.get('model')[scopeVarName];
				}
				varsString += Y.Lang.sub(SCOPE_VAR_TEMPLATE, {scopeVarName: scopeVarName});
            }
        }
        return varsString;
    },

    /**
     * Model key should be unique representing the model in the main model object
     *
     *
     */
    _generateUniqueKey: function (bindKey, scopeModel) {
        var tokenizedKeys = bindKey.split('.');
        if (tokenizedKeys.length > 1 && typeof scopeModel[tokenizedKeys[0]] != 'undefined') {
            var scopeItem = scopeModel[tokenizedKeys[0]];
            bindKey = ((scopeItem._info && scopeItem._info.parentType == DATA_ARRAY) ? (scopeItem._info.parent + '.' + scopeItem._info.index) : '') + bindKey;
        }
        return bindKey;
    },

    /**
     * Sets model directly in the main model object
     *
     */
    _setModel: function (bindKey, value, scopeModel) {
        var tokenizedKeys = bindKey.split('.');
        // look first at the dynamic scope created for example loop scope
        if (tokenizedKeys.length > 1 && typeof scopeModel[tokenizedKeys[0]] != 'undefined') {
            var scopeItem = scopeModel[tokenizedKeys[0]];
            if (scopeItem && scopeItem._info && scopeItem._info.parentType == DATA_ARRAY) {
                tokenizedKeys.shift();
                var arrayItem = this.get('model')[scopeItem._info.parent][scopeItem._info.index];
                eval(this._generateObjectPropsAccessCode(tokenizedKeys, arrayItem));
                return;
            }
        }
        // look at main model object scope
        if (tokenizedKeys.length > 1 && typeof this.get('model')[tokenizedKeys[0]] != 'undefined') {
            var scopeItem = scopeModel[tokenizedKeys[0]];
            //bindKey = ((scopeItem._info && scopeItem._info.parentType == DATA_ARRAY) ? scopeItem._info.index : '') + bindKey;
            return;
        }
        // single key model setting
        this.get('model')[bindKey] = value;
    },

    /**
     * Retrieves model values using dot notation e.g person.name
     *
     */
    _getModel: function (bindKey, scopeModel) {
        var tokenizedKeys = bindKey.split('.');
        if (tokenizedKeys.length > 1 && typeof scopeModel[tokenizedKeys[0]] != 'undefined') {
            var property = scopeModel;
            for (var i = 0; i < tokenizedKeys.length; i++) {
                property = property[tokenizedKeys[i]];
            }
            return property;
        }
        return this.get('model')[bindKey];
    },

    /**
     * Generates code to set specific array items by going inside the object
     *
     */
    _generateObjectPropsAccessCode: function (tokenizedProperties, baseObject) {
        var code = 'this.get("model")[scopeItem._info.parent][scopeItem._info.index]';
        Y.Array.each(tokenizedProperties, function (item) {
            code += Y.Lang.sub('["{property}"]', {
                property: item
            });
        });
        return (code + ' = value');
    },

    _getDirectiveName: function (directiveName) {
        return this.get('prefix') + directiveName;
    }

}, {
    ATTRS: {
        /**
         * Main container where Y.Common.DomBind is going to look
         *
         * @attribute container
         * @type Y.Node
         */
        container: {
            value: null
        },

        /**
         * Model that will be bind, every change will be reflected and centralized on this data unit
         *
         * @attribute model
         * @type {Object}
         */
        model: {
            value: null
        },
        
        /**
         * Controller methods
         * 
         * @attribute controller
         * @type {Object}
         * @default {}
         */
        controller: {
            value: {}
        },

        /**
         * Filter methods to be used on list/array iteration
         * 
         * @attribute filters
         * @type {Object}
         * @default {}
         */
        filters: {
            value: {}
        },

        /**
         * Map of templates each item should contain template markup, then each item can be referenced by using the template key
         * 
         * @attribute templates
         * @type {Object}
         * @default {}
         */
        templates: {
            value: {}
        },

        /**
         * Prefix to be used in the directives
         * 
         * @attribute prefix
         * @type {String}
         * @default 'data-db'
         */
        prefix: {
            value: 'data-db'
        }


    }
});