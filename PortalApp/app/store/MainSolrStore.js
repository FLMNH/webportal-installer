/* Copyright (C) 2020, Specify Collections Consortium
 * 
 * Specify Collections Consortium, Biodiversity Institute, University of Kansas,
 * 1345 Jayhawk Boulevard, Lawrence, Kansas, 66045, USA, support@specifysoftware.org
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
*/
var settingsStore =  Ext.getStore('SettingsStore');
var settings = settingsStore.getAt(0);
var solrURL = settings.get('solrURL');
var solrPageSize = settings.get('solrPageSize');
var maxPageSizeSetting = settings.get('maxSolrPageSize');
var solrUrlTemplate = solrURL + 'select?indent=on&version=2.2&fq=&rows=' + solrPageSize + '&fl=*%2Cscore&qt=&wt=json&explainOther=&hl.fl=&q=';
//ideally we would want to use the csv.mv.escape parameter to set the escape to 'none' for what solr thinks are multivalued fields but seem to be any fields with commas,
//but according to sources on the web, there is no way to set sv.escape to none. So we end up with all commas preceded by \ in the csv output.
//csv.mv.separator=%09 means that only tabs will be preceded by \, which we can live with.
var solrUrlTemplateCsv = solrURL + 'select?indent=on&version=2.2&fq=&rows=99999999&fl=*&qt=&wt=csv&csv.mv.separator=%09&explainOther=&hl.fl=&q=';

Ext.override(Ext.data.proxy.Ajax, {
                
            doRequest: function(operation, callback, scope) {
                var writer  = this.getWriter(),
                    request = this.buildRequest(operation, callback, scope);
                
                if (operation.allowWrite()) {
                    request = writer.write(request);
                }
                
                Ext.apply(request, {
                    headers       : this.headers,
                    timeout       : this.timeout,
                    scope         : this,
                    callback      : this.createRequestCallback(request, operation, callback, scope),
                    method        : this.getMethod(request),
                    disableCaching: false // explicitly set it to false, ServerProxy handles caching
                });
                
                //Added... jsonData is handled already
                if(this.jsonData) {
                    request.jsonData = Ext.encode(this.qparams);
                }
                
                Ext.Ajax.request(request);
                
                return request;
            }
});

Ext.define('SpWebPortal.store.MainSolrStore', {
    extend: 'Ext.data.Store',
    id: 'mainsolr',

    //requires: 'SpWebPortal.model.MainModel',
    requires: [
        'SpWebPortal.store.SettingsStore'
    ],
    pageSize: solrPageSize,
    config: {
	urlTemplate: solrUrlTemplate,
        urlTemplateCsv: solrUrlTemplateCsv,
	geoCoordFlds: [], //due to mysterious initialization behavior, this
	                 //is not set until the MainGrid.js initComponent() is executed
	maxPageSize: typeof maxPageSizeSetting === "undefined" ? 5000 : maxPageSizeSetting,
	currentMapFitFilter: '',
	images: false, 
	maps: false, 
	mainTerm: '', 
	filterToMap: false, 
	matchAll: false,
	searched: false,
	treeLevels: null,
        notForCsv: ['spid','geoc','contents']
    },

    autoLoad: false,
    remoteSort: true,

    model: 'SpWebPortal.model.MainModel',

    proxy: {
	type: 'ajax',
	callbackKey: 'json.wrf',
	url: solrUrlTemplate,
        jsonData: true,
        actionMethods: {
            read: 'POST'
        },
	reader: {
	    root: 'response.docs',
	    totalProperty: 'response.numFound'
	}
    },

    roundNumber: function(rnum, rlength) { // Arguments: number to round, number of decimal places
	return Math.round(rnum*Math.pow(10,rlength))/Math.pow(10,rlength);
    },

    getLatLngFitFilter: function(lat, lng, sw, ne) {
	var result = lat + ':[' + this.roundNumber(sw.lat(), 4) + ' TO ' + this.roundNumber(ne.lat(), 4) + '] AND ';
	if ((sw.lng() > 0 && ne.lng() < 0) ||
            (((sw.lng() < 0 && ne.lng() < 0) || (sw.lng() >= 0 && ne.lng() >=0)) && sw.lng() > ne.lng())) {
	    result += 'NOT ' + lng + ':[' + this.roundNumber(ne.lng(), 4) + ' TO ' + this.roundNumber(sw.lng(), 4) + ']';
        }  else {
	    result +=  lng + ':[' + this.roundNumber(sw.lng(), 4) + ' TO ' + this.roundNumber(ne.lng(), 4) + ']';
	}
	return result;
    },


    getLatLngFilter: function(geoCoords) {
	var result = '';
	for (var i = 0; i < geoCoords.length; i++) {
	    if (i > 0) result += ' AND ';
	    result += this.getGeoCoordFlds()[i] + ':' + geoCoords[i] + '';
	}
	return result.replace(/-/g, "\\-");;
    },

    getSolrUrlTemplate: function() {
        return solrUrlTemplate;
    },
    
    getMapFitFilter: function() {
	var map = Ext.getCmp('spwpmainmappane').getMapCmp();
	var bnds = map.getBounds();
	var sw = bnds.getSouthWest();
	var ne = bnds.getNorthEast();

	var lat1Fld = this.getGeoCoordFlds()[0];
	var lng1Fld = this.getGeoCoordFlds()[1];
	var lat2Fld = this.getGeoCoordFlds().length > 2 ? this.getGeoCoordFlds()[2] : null;
	var lng2Fld = this.getGeoCoordFlds().length > 3 ? this.getGeoCoordFlds()[3] : null;

	var result = '';
	if (lat1Fld != null && lng1Fld != null) {
	    result += this.getLatLngFitFilter(lat1Fld, lng1Fld, sw, ne);
	}
	if (lat2Fld != null && lng2Fld != null) {
	    result += this.getLatLngFitFilter(lat2Fld, lng2Fld, sw, ne);
	}
	//console.info(result);
	return result;
    },

    changePageSize: function(newPageSize) {
	if (newPageSize > 0 && newPageSize <= this.getMaxPageSize() && newPageSize != this.pageSize) {
	    this.pageSize = newPageSize;
	    var newTemplate = solrURL + 'select?indent=on&version=2.2&fq=&rows=' + solrPageSize + '&fl=*%2Cscore&qt=&wt=json&explainOther=&hl.fl=&q=';
	    this.proxy.url = this.proxy.url.replace(this.urlTemplate, newTemplate);
	    this.urlTemplate = newTemplate;
	    solrUrlTemplate = newTemplate;
	    if (this.getCount() > 0) {
		this.loadPage(1);
	    }
	    return true;
	}
	return false;
    },
	
    getImageRequirementFilter: function() {
	return 'img:*';
    },

    getGeoCoordRequirementFilter: function(forJSON) {
	var result = '';
	var gFlds = this.getGeoCoordFlds();
	for (var f = 0; f < gFlds.length; f++) {
	    if (f > 0) {
		result += forJSON ? ' AND ' : '+AND+';
	    }
	    //result += gFlds[f] + ':[\\"\\" TO ^]';
	    result += gFlds[f] + ':[-180 TO 180]';
	}
	return result;
    },
    
    getSearchLatLngUrl: function(geoCoords) {
	return this.getSearchUrl(this.getImages(), this.getMaps(), this.getMainTerm(), 
                                 this.getFilterToMap(), this.getMatchAll(), geoCoords);
    },

    getSearchLatLngUrl4J: function(geoCoords) {
	return this.getSearchSpecs4J(this.getImages(), this.getMaps(), this.getMainTerm(), 
                                 this.getFilterToMap(), this.getMatchAll(), geoCoords);
    },

    getIdSearchSpecs4J: function(ids) {
	var images = this.getImages();
	var maps = this.getMaps();
	var mainTerm = this.getMainTerm();
	var filterToMap = this.getFilterToMap();
	var matchAll = this.getMatchAll();

	var idStr;
	if (ids.length == 1) {
	    idStr = ids[0];
	} else {
	    //not sure if this will work for thousands of ids??? As could happen for images for Ento CollEvents???
	    for (var i = 0; i < ids.length; i++) {
		if (i > 0) {
		    idStr += ' OR ';
		}
		idStr += ids[i];
	    }
	    idStr = '(' + idStr + ')';
	}
	var result = this.getSearchSpecs4J(false, false, 'spid:'+idStr, false, false);

	this.setImages(images);
	this.setMaps(maps);
	this.setMainTerm(mainTerm);
	this.setFilterToMap(filterToMap);
	this.setMatchAll(matchAll);

	return result;
    },

    getIdUrl: function(ids) {
	var images = this.getImages();
	var maps = this.getMaps();
	var mainTerm = this.getMainTerm();
	var filterToMap = this.getFilterToMap();
	var matchAll = this.getMatchAll();

	var idStr;
	if (ids.length == 1) {
	    idStr = ids[0];
	} else {
	    //not sure if this will work for thousands of ids??? As could happen for images for Ento CollEvents???
	    for (var i = 0; i < ids.length; i++) {
		if (i > 0) {
		    idStr += ' OR ';
		}
		idStr += ids[i];
	    }
	    idStr = '(' + idStr + ')';
	}
	var result = this.getSearchUrl(false, false, 'spid:'+idStr, false, false);

	this.setImages(images);
	this.setMaps(maps);
	this.setMainTerm(mainTerm);
	this.setFilterToMap(filterToMap);
	this.setMatchAll(matchAll);

	return result;
    },

    getSearchSpecs4J: function(images, maps, mainTerm, filterToMap, matchAll, geoCoords, csv, dontSetConditions) {
        if (!dontSetConditions) {
            this.setImages(images);
	    this.setMaps(maps);
	    this.setMainTerm(mainTerm);
	    this.setFilterToMap(filterToMap);
	    this.setMatchAll(matchAll);
        }
        return {
            query: this.getJSONQuery(images, maps, mainTerm, filterToMap, matchAll, geoCoords),
            url: this.getSearchUrl4J(csv)
        };
    },
    
    getJSONQuery: function(images, maps, mainTerm, filterToMap, matchAll, geoCoords) {
	var mainQ = mainTerm;
	var mapFilter = filterToMap || typeof geoCoords !== "undefined";
	if (images) {
	    mainQ += ' AND ' + this.getImageRequirementFilter();
	}
        if (maps) {
            mainQ += ' AND ' + this.getGeoCoordRequirementFilter(true);
        }
        if (mapFilter) {
	    var mapFitter = typeof geoCoords === "undefined"
		? this.getMapFitFilter()
		    : this.getLatLngFilter(geoCoords);
	    mainQ += ' AND ' + mapFitter;
	    this.setCurrentMapFitFilter(mapFitter);
        } else {
	    this.setCurrentMapFitFilter('');
	}
        if (this.collItems) {
            var collectionFilter = this.getCollectionFilter4J();
            if (collectionFilter) {
                mainQ += ' AND ' + collectionFilter;
            }
        }
        return mainQ;        
    },

    getCollectionFilter4J: function() {
        var collCodeFld = Ext.getStore('SettingsStore').getAt(0).get('collCodeSolrFld');
        var result;
        if (collCodeFld) {
            var codes = [];
            for (var i = 0; i < this.collItems.length; i++) {
                if (this.collItems[i].checked) {
                    codes.push('"' + this.collItems[i].name + '"');
                }
            }
            if (codes.length < this.collItems.length) {
                result = '(';
                for (i = 0; i < codes.length; i++) {
                    if (i > 0) {
                        result += ' OR ';
                    }
                    result += collCodeFld + ':' + codes[i];
                }
                result += ')';
            }
        }
        return result;
    },
    
    getSearchUrl4J: function(csv) {
	var url = (csv ? this.urlTemplateCsv.replace('&fl=*', this.getCsvFldParam()) : this.urlTemplate);
        //not sure how matchAll will work???
        //if (matchAll) { 
	//    url += "&q.op=AND";
	//} 
	return url;
    },

    getSearchUrl: function(images, maps, mainTerm, filterToMap, matchAll, geoCoords, csv) {

	this.setImages(images);
	this.setMaps(maps);
	this.setMainTerm(mainTerm);
	this.setFilterToMap(filterToMap);
	this.setMatchAll(matchAll);

	var mainQ = mainTerm;
	var mapFilter = filterToMap || typeof geoCoords !== "undefined";
	if (images || maps || mapFilter) {
	    mainQ = '_query_:"' + mainQ + '"+AND+_query_:"';
	}
	var url = (csv ? this.urlTemplateCsv.replace('&fl=*', this.getCsvFldParam()) : this.urlTemplate) + mainQ;

	if (images) {
	    url += this.getImageRequirementFilter();
	}
	if (maps) {
	    if (images) {
		url += '+AND+';
	    }
	    url += this.getGeoCoordRequirementFilter();
	}
	if (mapFilter) {
	    var mapFitter = typeof geoCoords === "undefined"
		? this.getMapFitFilter()
		: this.getLatLngFilter(geoCoords);
	    if (images || maps) {
		url += '+AND+';
	    }
	    url += mapFitter;
	    this.setCurrentMapFitFilter(mapFitter);
	} else {
	    this.setCurrentMapFitFilter('');
	}
	if (images || maps || mapFilter) {
	    url += '"';
	}
	if (matchAll) { 
	    url += "&q.op=AND";
	} 
	
	return url;
    },

    setupTrees: function() {
	this.treeLevels = [];
	var fields = Ext.getStore('FieldDefStore');
	for (var f = 0; f < fields.getCount(); f++) {
	    var treeId = fields.getAt(f).get('treeid');
	    if (typeof treeId !== "undefined" && treeId != null && treeId != '') {
		var addIt = true;
		for (var t = 0; t < this.treeLevels.length; t++) {
		    if (this.treeLevels[t] == treeId) {
			addIt = false;
			break;
		    }
		}
		if (addIt) {
		    this.treeLevels.push([treeId]);
		}
	    }
	}
    },

    setupTreeLevel: function(treeIdx) {
	var tree = this.treeLevels[treeIdx];
	var currTreeId = tree[0];
	var fields = Ext.getStore('FieldDefStore');
	var ranks = [];
	for (var f = 0; f < fields.getCount(); f++) {
	   var fld = fields.getAt(f);
	   if (fld.get('treeid') == currTreeId) {
	       ranks.push([fld.get('treerank'), fld.get('solrname')]);
	   }   
	} 	
	ranks.sort(function(a,b){return a[0] - b[0];});
	tree = tree.concat(ranks);
	this.treeLevels[treeIdx] = tree;
    },
	
    setupTreeLevels: function() {
	this.setupTrees();
	for (var t = 0; t < this.treeLevels.length; t++) {
	    this.setupTreeLevel(t);
	}
    },
	
    getTreeLevelIdx: function(fld) {
	var treeIdx = -1;
	var fldIdx = -1;
	for (var t = 0; t < this.treeLevels.length; t++) {
	    var treeLevel = this.treeLevels[t];
	    for (var f = 1; f < treeLevel.length; f++) {
		if (treeLevel[f][1] == fld) {
		    treeIdx = t;
		    fldIdx = f;
		    break;
		}
	    }
	    if (treeIdx != -1) {
		break;
	    }
	}
	return [treeIdx, fldIdx];
    },

    getSortStr: function(sortSpec) {
	var fld = sortSpec.property;
	var dir = sortSpec.direction.toLowerCase();
	var treePos = this.getTreeLevelIdx(fld);
	var sorts = [[fld, dir]];
	if (treePos[0] != -1 && treePos[1] != -1) {
	    var grid = Ext.getCmp('spwpmaingrid');
	    var treeLevel = this.treeLevels[treePos[0]];
	    for (var l = treePos[1]+1; l < treeLevel.length; l++) {
		if (!grid.isColumnHidden(treeLevel[l][1])) {
		    sorts.push([treeLevel[l][1], dir]);
		}
	    } 
	} 
	var result = '';
	for (var s = 0; s < sorts.length; s++) {
	    if (s > 0) result += ',';
	    result += sorts[s][0] + '+' + sorts[s][1];
	}
	return result;
    },

    getCsvFldTitle: function(fld) {
        var result = fld.get('title') + '';
        if (result == '') {
            result = fld.get('spfldtitle') + '';
        }
        if (result == '') {
            result = fld.get('solrname');
        }
        return result.replace(/ |\(|\)|\#|\@|\$|\%|\&|\+|\-|\=|\"|\'|\?|\<|\>|\.|\,|\:|\;|\*|\!|\/|\||\]|\[|\\n|\\t|\}|\{/g,'');
    },

    isCsvFld: function(fld) {
        return this.notForCsv.indexOf(fld.get('solrname')) == -1;
    },
    
    getCsvFldParam: function() {
        var flds = Ext.getStore('FieldDefStore');
        //to only currently visible fields could use Ext.getCmp('spwpmaingrid')
        var result = '';
        for (var f = 0; f < flds.getCount(); f++) {
            var fld = flds.getAt(f);
            if (this.isCsvFld(fld)) {
                result += (result.length > 0 ? "," : "") + this.getCsvFldTitle(fld) + ":" + fld.get('solrname');
            }
        }
        if (result == '') {
            result = '*';
        }
        return '&fl=' + encodeURIComponent(result);
    },
            
    listeners: {
	'beforeload': function(store, operation) {
	    //alert('beforeload: ' + store.getProxy().url);
	    if (store.sorters.getCount() > 0) {
		if (this.treeLevels == null) {
		    this.setupTreeLevels();
		    console.info(this.treeLevels);
		}
		var url = store.getProxy().url;
		var sortIdx = url.lastIndexOf('&sort=');
		if (sortIdx != -1) {
		    url = url.substring(0, sortIdx);
		}
		var sortStr = '';
		for (var s = 0; s < store.sorters.getCount(); s++) {
		    var sorter = store.sorters.getAt(s);
		    if (s > 0) sortStr += ',';
		    sortStr += this.getSortStr(sorter);
		}
		if (sortStr != '') {
		    sortStr = 'sort=' + sortStr;
		    store.getProxy().url = url + '&' + sortStr;
		}
	    }
	}
    }
});
