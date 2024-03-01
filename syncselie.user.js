// ==UserScript==
// @name            Syncselie
// @author          Smushies
// @namespace       https://steamcommunity.com/id/smushies/
// @description     Exports a Barter.vg list to Steam, then run a gg.deals wishlist sync.
// @match           http*://barter.vg/u/*/*/x*
// @version         0.1
// @run-at          document-end
// @grant           GM.xmlHttpRequest
// @connect			gg.deals
// @connect         store.steampowered.com
// @connect			barter.vg
// @homepageURL		https://github.com/Smushies/Syncselie
// @supportURL		https://github.com/Smushies/Syncselie/issues
// @downloadURL		https://github.com/Smushies/Syncselie/raw/master/syncselie.user.js
// @updateURL       https://github.com/Smushies/Syncselie/raw/master/syncselie.user.js
// ==/UserScript==

var username = "";
var sessionid = "";
var barterList = [];
var steamWishlist = [];
var ggWishlist = [];
var needAdd = [];
var needRemove = [];

function addHtml() {
	const syncButton = document.createElement("button");
	syncButton.setAttribute('id', 'syncselie');
	syncButton.setAttribute('type', 'button');
	syncButton.setAttribute('class', 'addTo bborder');
	syncButton.setAttribute('title', 'Sync to Steam Wishlist then gg.deals');
	syncButton.setAttribute('style', 'float:right; margin-right:2px; margin-left:2px; cursor:pointer;');
	syncButton.textContent = 'Syncselie';
	syncButton.addEventListener('click', startSync);
	
	const container = document.getElementsByClassName("extraTop")[0];
	container.appendChild(syncButton);
	
	const syncUpdates = document.createElement('span');
	syncUpdates.setAttribute('id', 'syncselieLog');
	syncUpdates.setAttribute('style', 'overflow:auto; height:8.125em; display:none; float:right');
	container.after(syncUpdates);
}

async function startSync() {
	document.getElementById('syncselieLog').innerHTML = '';
	await getInfo();
	confirmDifferences();
}

function updateSyncselieLogs(newLog, type) {
	let symbol = "✔️ ";
	switch(type) {
		case 1: symbol = "❌ "; break;
		case 2: symbol = "➖ "; break;
		default: symbol = "✔️ ";
	}
	let logElem = document.getElementById('syncselieLog');
	let node = document.createElement('div');
	node.textContent = symbol + newLog;
	logElem.prepend(node);
	logElem.style.display = 'inherit';
}

async function getInfo() {
	
	let p1 = getBarterList(document.location.toString().slice(0,document.location.toString().lastIndexOf('/x')));
	let resp = await makeRequest("GET", "https://store.steampowered.com/wishlist")
	.catch(error => {
		updateSyncselieLogs(`Steam wishlist call failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`Steam wishlist call failed. ${JSON.stringify(error)}`);
	});
	
	const parser = new DOMParser();
	const htmlDoc = parser.parseFromString(resp.responseText, 'text/html');
	username = htmlDoc.getElementsByClassName('wishlist_header')[0].textContent.trim();
	if (username.length < 1) {
		updateSyncselieLogs(`Could not get Steam wishlist. Are you logged into Steam?`, 1);
		throw new Error("Could not get Steam wishlist. Are you logged into Steam?");
	}
	let p2 = getSteamWishlist(resp.finalUrl);
	let p3 = getGGDealsInfo();
	
	return Promise.all([p1, p2, p3]);
}

async function getSteamWishlist(path) {
	let headers = { "Cache-Control": "no-cache" };
	let resp = await makeRequest("GET", path + "/wishlistdata", null, headers)
	.catch(error => {
		updateSyncselieLogs(`Steam wishlistdata call failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`Steam wishlistdata call failed. ${JSON.stringify(error)}`);
	});
	
	let data = JSON.parse(resp.responseText);
	let keys = Object.keys(data);
	steamWishlist = Object.values(data).map((x,i) => ({id: keys[i], name: x.name}));
	updateSyncselieLogs(`Got ${username} of ${steamWishlist.length} steam apps`, 0);
}

async function getGGDealsInfo() {
	let resp = await makeRequest("GET", "https://gg.deals/wishlist/")
	.catch(error => {
		updateSyncselieLogs(`gg.deals wishlist call failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`gg.deals wishlist call failed. ${JSON.stringify(error)}`);
	});
	
	const parser = new DOMParser();
	const htmlDoc = parser.parseFromString(resp.responseText, 'text/html');
	ggWishlist = Array.from(htmlDoc.getElementsByClassName('game-info-title')).map(x => x.textContent);
	let ggUsername = htmlDoc.getElementsByClassName('menu-profile-label')[0].childNodes[0].textContent;
	if (ggUsername.length == 0) {
		updateSyncselieLogs(`gg.deals user missing. Are you signed into gg.deals?`, 1);
		throw new Error("gg.deals user missing. Are you signed into gg.deals?");
	}
	if (ggUsername != username.slice(0,ggUsername.length)) {
		updateSyncselieLogs(`Steam user ${username.slice(0,ggUsername.length)} and gg.deals user ${ggUsername} do not match. Are you on the right account?`, 1);
		throw new Error("Steam user and gg.deals user do not match. Are you on the right account?");
	}
	username = ggUsername;
	updateSyncselieLogs(`Got ${username}'s gg.deals wishlist of ${ggWishlist.length} items`);
}

async function getBarterList(path) {
	let resp = await makeRequest("GET", path + "/json")
	.catch(error => {
		updateSyncselieLogs(`Barter json call failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`Barter json call failed. ${JSON.stringify(error)}`);
	});
	
	let data = JSON.parse(resp.responseText);
	barterList = Object.values(data.by_platform[1]).filter(x => x.platform_id == 1 || (x.platform_id == 2 && x.ci_type == "custom")).map(x => ({id: x.sku, name: x.title, type: x.platform_id}));
	updateSyncselieLogs(`Got Barter.vg list of ${barterList.length} items`);
}

function confirmDifferences() {
	needAdd = barterList.filter(x => x.type == 1 && !steamWishlist.some(y => y.id == x.id));
	needRemove = steamWishlist.filter(x => !barterList.some(y => y.id == x.id));
	console.log(needAdd);
	console.log(needRemove);
	
	let log = document.createElement('div');
	log.id = "confirmMe";
	log.style = "font-weight:bold";
	
	let confirmer = document.createElement('a');
	confirmer.textContent = "Confirm";
	confirmer.addEventListener('click', wishselie);
	log.appendChild(document.createTextNode("("));
	log.appendChild(confirmer)
	log.appendChild(document.createTextNode(`)  ${username} Wishlist: Add ${needAdd.length} / Remove ${needRemove.length}`));
	
	document.getElementById('syncselieLog').prepend(log);
}

async function wishselie() {
	document.getElementById("confirmMe").remove();
	updateSyncselieLogs(`Steam Wishlist: Add ${needAdd.length} / Remove ${needRemove.length}`);
	
	let logElem = document.getElementById('syncselieLog');
	if (needRemove.length > 0) {
		let removes = document.createElement('div');
		removes.id = "steamRemoves"
		removes.textContent = "➖ Removed: ";
		logElem.prepend(removes);
	}
	if (needAdd.length > 0) {
		let adds = document.createElement('div');
		adds.id = "steamAdds";
		adds.textContent = "➖ Added: ";
		logElem.prepend(adds);
	}
	
	await Promise.all(needAdd.map(async (g) =>
		await addSteamWishlist(g)
	),
	needRemove.map(async (g) =>
		await addSteamWishlist(g)
	));
	
	if (needAdd.length > 0)
		document.getElementById('steamAdds').textContent = "✔️" + document.getElementById('steamAdds').textContent.substring(1);
	if (needRemove.length > 0)
		document.getElementById('steamRemoves').textContent = "✔️" + document.getElementById('steamRemoves').textContent.substring(1);
	
	if(needAdd.some(g => g.failed)) {
		let names = needAdd.filter(g => g.failed).reduce((a,g) => a + g.name + ", ", "");
		updateSyncselieLogs(`Failed to add: ${names}`, 1);
	}
	
	if(needRemove.some(g => g.failed)) {
		let names = needRemove.filter(g => g.failed).reduce((a,g) => a + g.name + ", ", "");
		updateSyncselieLogs(`Failed to remove: ${names}`, 1);
	}
}

async function addSteamWishlist(game) {
	let headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Origin": "https://store.steampowered.com", "Cache-Control": "no-cache" };
	let resp = await makeRequest("POST", "https://store.steampowered.com/api/addtowishlist", `appid=${game.id}`, headers)
	.catch(error => {
		updateSyncselieLogs(`Adding ${game.name} to Steam wishlist failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`Adding ${game.name} to Steam wishlist failed. ${JSON.stringify(error)}`);
	});
	
	let data = JSON.parse(resp.responseText);
	
	if (data.success) {
		let addElem = document.getElementById('steamAdds');
		addElem.textContent += `${game.name}, `;
	}
	
	needAdd.find(g => g.id == game.id).failed = !data.success;
}

async function removeSteamWishlist(game) {
	let headers = { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "Origin": "https://store.steampowered.com", "Cache-Control": "no-cache"};
	let resp = await makeRequest("POST", "https://store.steampowered.com/api/removefromwishlist", `appid=${game.id}`, headers)
	.catch(error => {
		updateSyncselieLogs(`Removing ${game.name} from Steam wishlist failed. ${JSON.stringify(error)}`, 1);
		throw new Error(`Removing ${game.name} from Steam wishlist failed. ${JSON.stringify(error)}`);
	});
	
	let data = JSON.parse(resp.responseText);
	
	if (data.success) {
		let remElem = document.getElementById('steamRemoves');
		remElem.textContent += `${game.name}, `;
	}
	
	needRemove.find(g => g.id == game.id).failed = !data.success;
	
}

function makeRequest(method, url, data = null, headers = null) {
    return new Promise(function (resolve, reject) {
        GM.xmlHttpRequest({
			method: method,
			url: url,
			data: data,
			headers: headers,
			onload: (resp => {
				if (resp.status >= 200 && resp.status < 400) {
					resolve(resp);
				} else {
					reject({
						status: resp.status,
						statusText: resp.statusText
					});
				}
			}),
			onerror: (resp => {
				reject({
					status: resp.status,
					statusText: resp.statusText
				});
			})
		});
    });
}

addHtml();
