const ENABLED_CLASS = "enabled";
const DISABLED_CLASS = "disabled";
const ZERO_INSTALLED_CLASS = "zerostyles";
const UNAVAILABLE_CLASS = "unavailable";
const STYLES_CLASS = "have-styles";

var writeStyleTemplate = document.createElement("a");
writeStyleTemplate.className = "write-style-link";

const installed = document.getElementById("installed");
const body = document.getElementsByTagName('body')[0];
const zeroStyles = document.getElementById("zerostyles");
const unavailable = document.getElementById("unavailable");
const disableAllCheckbox = document.getElementById("disable-all-checkbox");

var menutype;
var website;

var domain = '';

function isDisabledAll(){
	return browser.extension.getBackgroundPage().prefs.get("disableAll");
}

function buildDomainForFiltering(url){
	var parsed = parseUrl(url);
	return parsed.protocol + "//" + parsed.hostname + "/";
}


function renderPageForAllCases(){
	renderAllSwitch(true);
	disableAllCheckbox.addEventListener('change', onDisableAllCheckboxChange);
}

// render for unavailable page
function renderPageForUnavailable() {
	renderPageForAllCases();
	body.classList.add(UNAVAILABLE_CLASS);
}

// render for available page
function renderInstalledTab(styles){
	renderPageForAllCases();
	if (styles.length == 0){
		renderPageForNoStyles();
	} else {
		renderPageWithStyles(styles);
	}
}

// render for a page with no style
function renderPageForNoStyles(){
	body.classList.remove(STYLES_CLASS);
	body.classList.add(ZERO_INSTALLED_CLASS);
}

// render for a page with styles
function renderPageWithStyles(styles){
	body.classList.remove(ZERO_INSTALLED_CLASS);
	body.classList.add(STYLES_CLASS);
	styles.forEach((style)=> {
		addStyleToInstalled(style);
	});
}

function addStyleToInstalled(style){
	style.style_first_word = style.name.substr(0, 1);
	style.style_edit_url = "/edit.html?id=" + style.id;
	var el = installedStyleToElement(style);
	if (style.author === undefined) {
		el.querySelector('.style-author').style.display = 'none';
	}
	el.querySelector(".activate").checked = style.enabled;
	el.querySelector(".edit").addEventListener('click', openLink);
	el.querySelector(".activate").addEventListener('change', onActivateChange(style));
	el.querySelector(".delete").addEventListener('click', onDeleteStyleClick(style));
	//material
	if (typeof(componentHandler) !== 'undefined') {
		componentHandler.upgradeElement(el.querySelector(".mdl-switch"), 'MaterialSwitch');
	}
	installed.appendChild(el);
	return el;
}

function installedStyleToElement(style){
	return MustacheTemplate.render("style-installed-item", style);
}

function renderAllSwitch(isFirst){
	if (!isDisabledAll()){
		disableAllCheckbox.checked = true;
		body.classList.remove("all-off");
		body.classList.add("all-on");
	}else{
		body.classList.remove("all-on");
		body.classList.add("all-off");
	}
	//material
	if (typeof(componentHandler) !== 'undefined' && isFirst) {
		componentHandler.upgradeElement(disableAllCheckbox.parentElement, 'MaterialSwitch');
	}
}

function onDisableAllCheckboxChange(){
	var disable = !this.checked;
	prefs.set("disableAll", disable);
	renderAllSwitch();
	notifyBackground({method: "styleDisableAll", disableAll: disable}).then(() => {
		notifyAllTabs({method: "styleDisableAll", disableAll: disable});
	});
}

function onActivateChange(style){
	return (e) => {
		e.preventDefault();
		e.stopImmediatePropagation();
		enableStyle(style.id, e.target.checked).then(onActivationStatusChanged(style.id, e.target.checked));
	};
}

function onDeleteStyleClick(style){
	return (e) => {
		e.preventDefault();
		e.stopImmediatePropagation();
		deleteStyle(style.id).then(onStyleDeleted(style));
	}
}

function onStyleDeleted(style){
	return () => {
		var old = document.getElementById("installed-style-"+style.id);
		var parent = old.parentNode;
		parent.removeChild(old);
		if (installed.childNodes.length == 0){
			renderPageForNoStyles();
		}
	}
}

function onActivationStatusChanged(styleId, enabled){
	return () => {
		var old = document.getElementById("installed-style-"+styleId);
		old.classList.remove(ENABLED_CLASS);
		old.classList.remove(DISABLED_CLASS);
		old.classList.add(enabled?ENABLED_CLASS : DISABLED_CLASS);
	}
}

function parseUrl(url){
	var a = document.createElement('a');
	a.href = url;
	return a;
}

function updatePopUp(tab) {
	updateSiteName(tab.url);
	updateCreateStyleLink(tab.url);
}

function updateCreateStyleLink(url){
	if (canStyle(url)) {
		var createNewStyleLink = document.getElementById('write-new-style-link');
		createNewStyleLink.href += "?domain=" + getSiteName(url);
	}
}

function updateSiteName(url){
	document.getElementById('sitename').innerHTML = getSiteName(url);
	if (canStyle(url)) {
		domain = getSiteName(url);
		document.getElementById('searchStylesMenu').childNodes.forEach((el) => {
			el.addEventListener('click', onSearchClick);
		});
	} else {
		document.getElementById('searchStyles').style.display = 'none';
	}
}

function getSiteName(tabUrl){
	if (tabUrl.indexOf('about:') === 0) {
		return /about:(\w+)/.exec(tabUrl)[0];
	}
	var a = document.createElement('a');
	a.href = tabUrl;
	return a.hostname;
}

function openLink(e) {
	if (!this.href && !e.target.href) {
		return;
	}
	e.preventDefault();
	browser.runtime.sendMessage({method: "openURL", url: this.href || e.target.href});
	close();
}

function handleUpdate(style) {
	var styleElement = installed.querySelector("#installed-style-" + style.id);
	if (styleElement) {
		installed.removeChild(styleElement);
		addStyleToInstalled(style);
	} else {
		getActiveTabRealURL((url) => {
			if (browser.extension.getBackgroundPage().getApplicableSections(style, url).length) {
				installed.appendChild(installedStyleToElement(style));
			}
		});
	}
}

function handleDelete(id) {
	var styleElement = installed.querySelector("[style-id='" + id + "']");
	if (styleElement) {
		installed.removeChild(styleElement);
	}
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.method == "updatePopup") {
		switch (request.reason) {
			case "styleAdded":
			case "styleUpdated":
				handleUpdate(request.style);
				break;
			case "styleDeleted":
				handleDelete(request.id);
				break;
		}
	}
});

getActiveTab((tab) => {
	updatePopUp(tab);
	if (canStyle(tab.url)) {
		getInstalledStyleForDomain(tab.url).then(renderInstalledTab);
	} else {
		renderPageForUnavailable();
	}
});

document.querySelectorAll(".open-manage-link").forEach((el) => {
	el.addEventListener("click", openLink, false);
});

function onSearchClick() {
	let url = this.getAttribute('data-url').replace('%s', domain);
	browser.runtime.sendMessage({method: "openURL", "url": url});
	close();
}