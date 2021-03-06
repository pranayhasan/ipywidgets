// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// ES6 Promise polyfill
(require('es6-promise') as any).polyfill();

// Element.prototype.matches polyfill
if (Element && !Element.prototype.matches) {
    let proto = Element.prototype as any;
    proto.matches = proto.matchesSelector ||
    proto.mozMatchesSelector || proto.msMatchesSelector ||
    proto.oMatchesSelector || proto.webkitMatchesSelector;
}

// Load styling
require('font-awesome/css/font-awesome.css');
require('@phosphor/widgets/style/index.css');
require('../css/widgets.css');

// Load json schema validator
var Ajv = require('ajv');
var widget_state_schema = require('jupyter-widgets-schema').v2.state;
var widget_view_schema = require('jupyter-widgets-schema').v2.view;

// Magic global widget rendering function:
import * as widgets from '../../jupyter-js-widgets/lib/index';
import * as embed from './embed-manager';
import * as _ from 'underscore';

// `LoadInlineWidget` is the main function called on load of the web page.
// All it does is inserting a <script> tag for requirejs in the case it is not
// available and call `renderInlineWidgets`
function loadInlineWidgets(event) {
    let loadRequire = new Promise(function(resolve, reject) {
        if ((window as any).requirejs) {
            resolve();
        } else {
            // If requirejs is not on the page on page load, load it from cdn.
            let scriptjs = require('scriptjs') as any;
            scriptjs('https://unpkg.com/requirejs/require.js', function() {
                resolve();
            });
        }
    });
    loadRequire.then(function() {
        // Define jupyter-js-widget requirejs module
        // (This is needed for custom widget model to be able to AMD require jupyter-js-widgets.)
        if (!(window as any).requirejs.defined('jupyter-js-widgets')) {
            (window as any).define('jupyter-js-widgets', function () {
                return widgets;
            });
        }
        // Render inline widgets
        renderInlineWidgets(event);
    });
}

// `renderInlineWidget` will call `renderManager(element, tag)` on each <script>
// tag of mime type
//     "application/vnd.jupyter.widget-state+json"
// contained in `event.element`.
export function renderInlineWidgets(event) {
    let element = event.target || document;
    let tags = element.querySelectorAll('script[type="application/vnd.jupyter.widget-state+json"]');
    for (let i=0; i!=tags.length; ++i) {
        renderManager(element, tags[i]);
    }
}

// Function `renderManager(element, tag)` creates a widget embed manager for the
// specified <script> tag (which must have mime type)
//     "application/vnd.jupyter.widget-state+json".
// Then it performs a look up of all script tags under the specified DOM
// element with the mime type
//     "application/vnd.jupyter.widget-view+json".
// For each one of these <script> tags, if the contained json specifies a model id
// known to the aforementioned manager, it is replaced with a view of the model.
//
// Besides, if the view script tag has an <img> sibling DOM node with class `jupyter-widget`,
// the <img> tag is deleted.
function renderManager(element, tag) {
    let widgetStateObject = JSON.parse(tag.innerHTML);
    let ajv = new Ajv(); // options can be passed, e.g. {allErrors: true}
    let model_validate = ajv.compile(widget_state_schema);
    let valid = model_validate(widgetStateObject);
    if (!valid) {
        console.log(model_validate.errors);
    }
    let manager = new embed.EmbedManager();
    manager.set_state(widgetStateObject, {}).then(function(models) {
        let tags = element.querySelectorAll('script[type="application/vnd.jupyter.widget-view+json"]');
        for (let i=0; i!=tags.length; ++i) {
            // TODO: validate view schema
            let viewtag = tags[i];
            let widgetViewObject = JSON.parse(viewtag.innerHTML);
            let view_validate = ajv.compile(widget_view_schema);
            let valid = view_validate(widgetViewObject);
            if (!valid) {
                console.log(view_validate.errors);
            }
            let model_id = widgetViewObject.model_id;
            let model = _.find(models, function(item : widgets.WidgetModel) {
                return item.id == model_id;
            });
            if (model !== undefined) {
                if (viewtag.previousElementSibling &&
                    viewtag.previousElementSibling.matches('img.jupyter-widget')) {
                    viewtag.parentElement.removeChild(viewtag.previousElementSibling);
                }
                let widgetTag = document.createElement('div');
                widgetTag.className = 'widget-subarea';
                viewtag.parentElement.insertBefore(widgetTag, viewtag);
                manager.display_model(undefined, model, { el : widgetTag });
            }
        }
    });
}

// Prevent the embedder to be defined twice.
if (!(window as any)._jupyter_widget_embedder) {
    (window as any)._jupyter_widget_embedder = true;
    window.addEventListener('load', loadInlineWidgets);
}
