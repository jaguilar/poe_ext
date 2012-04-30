var Match = Class.extend({
	init: function() {
		this.owned = []
		this.borrowed = []	
	},

	// Consider an item for matching. If you return true, that means that this matcher
	// now owns this item for the remainder of its lifetime.
	take: function (i) {
		return false;
	},

	// Returns a list of matches, which are objects with the following properties:
	// - complete: a number in [0, 1] that represents the completeness of this match.
	//     1 is complete.
	// - items: owned items that we matched on
	// - missing: a list of strings to display to the user carrying items that
	//            were not found in the list.
	getMatches: function () {
		return [];
	},
});


var RarenameMatch = Match.extend({
	init: function(count) {
		this.count = count;
		this.matches = {}
	},

	take: function(i) {
		if (i.rarity != 'rare' || !i.identified) return;
		var matchArray = this.matches[i.rareName];
		if (matchArray == null) {
			matchArray = this.matches[i.rareName] = []
		}
		matchArray.push(i);
	},

	getMatches: function() {
		var th = this;
		return $.map(this.matches, function (v, k) {
			return {complete: v.length * 1.0 / th.count, 
				    items:v,
					missing: [sprintf('%d rare(s) with this rarename:', th.count - v.length), k]}
		});
	}
});


var QualityMatch = Match.extend({
	// acceptableType: one of armor, flask, skillGem, or weapon.
	init: function(acceptableType) {
		this.currentQuality = 0.0;
		this.acceptableType = acceptableType;
		this.currentMatch = []
		this.matches = []
	},

	consider: function (i) {
		if (i.category == null) return false;
		if (i.quality == 0) return false;
		return (this.acceptableType == 'weapon' && 
					$.inArray(i.category, ['weapon1h', 'weapon2h']) != -1) ||
			(this.acceptableType == 'armor' && 
				$.inArray(i.category, ['head', 'chest', 'hands', 'feet']) != -1) ||
			(this.acceptableType == i.category);  // skillGem or flask
	},

	take: function (i) {
		if (!this.consider(i)) return;

		if (i.quality == 20) {
			this.matches.push([i]);
		} else {
			this.currentMatch.push(i);
			this.currentQuality += i.quality;
			if (this.currentQuality >= 40) {
				this.matches.push(this.currentMatch);
				this.currentMatch = [];
				this.currentQuality = 0;
			}
		}
	},

	getMatches: function () {
		var out = this.matches.map(function (m) {
			return { complete: 1, items: m };
		});
		out.push({ 
			complete: (this.currentQuality / 40.0),
			items: this.currentMatch, 
			missing: [sprintf('%ss with %d%% total quality', 
				              this.acceptableType,
				              40 - this.currentQuality)]
		});
		return out;
	}
});

var PredicateMatcher = Match.extend({
	init: function(pred) {
		this.matches = [];
		this.pred = pred;
	},

	take: function(i) {
		if (this.pred(i)) {
			this.matches.push(i);
		}
	},

	getMatches: function() {
		return $.map(this.matches, function (v, _) {
			return {complete: 1, items:[v]}
		})
	}
});

function TricolorMatch() { 
	return new PredicateMatcher(function (i) { return i.sockets && i.sockets.tricolor; });
}
function SocketMatch(reqcount, linked) {
	return new PredicateMatcher(
		function (i) { 
			return i.sockets && ((reqcount <= linked) ? 
				                 i.sockets.maxConnected : i.sockets.numSockets) > reqcount; 
		});
}
function RareModMatch(modcount) {
	return new PredicateMatcher(
		function (i) { return i.rarity == 'rare' && i.explicitModCount > modcount; });
}

var BaseTypeMatch = Match.extend({
	// The most important rarity should be first, then the second, and so on. 
	// We use this to score match completion, with each index getting descending amounts
	// credit.
	init: function(rarities, maxQuality) {
		this.scores = {unique:4, rare:2, magical:1, normal: 1}
		this.rarities = rarities;
		this.maxQuality = maxQuality;
		this.matches = {};
		this.completeScore = this.scoreRarities(rarities);
	},

	// Score an array of rarities.
	scoreRarities: function(r) {
		var s = 0;
		for (var i = 0; i < r.length; ++i) {
			s += this.scores[r[i]];
		}
		return s;
	},

	take: function(i) {
		// Don't keep anything without a 
		if (i.baseType == null || $.inArray(i.rarity, this.rarities) == -1 ||
			(i.quality < 20 && this.maxQuality)) { return; }
		var baseTypeMap = this.matches[i.baseType]
		if (baseTypeMap == null) {
			this.matches[i.baseType] = baseTypeMap = {}
		}
		baseTypeMap[i.rarity] = i;  // It's fine to replace what's already here.
	},

	credit: function(i) {
		if (i == 0) { return 0; }
		return i + this.credit(i-1);
	},

	getMatches: function() {
		var maxCredit = this.credit(this.rarities.length);
		var th = this;
		return $.map(this.matches, function (v, k) {
			var itemcredit = 0;
			var missing = $.map(th.rarities, function(rarity, idx) {
				if (!(rarity in v)) {
					return rarity;
				}
			})

			return {items: v, 
				    missing: $.merge([sprintf('%s%s with rarities:', 
				    	                      k, 
				    	                      th.maxQuality ? ' with %20 quality' : '')], 
				                     [missing.join(', ')]), 
				    complete: 1 - (1.0 * th.scoreRarities(missing) / th.completeScore)};
		});
	}
});

function mapMax(maps) {
	var out = {};
	$.map(maps, function (aMap, _) {
		$.map(aMap, function(v, k) {
			if (!out[k]) {
				out[k] = 0;
			}
			out[k] = Math.max(v, out[k]);
		});
	});
	return out;
}

var FullsetMatch = Match.extend({
	init: function(rarity, topQuality) {
		this.rarity = rarity;
		this.topQuality = topQuality;
		this.matchedParts = {
			head: [],
			chest: [],
			hands: [],
			feet: [],
			belt: [],
			ring: [],
			amulet: [],
			weapon1h: [],
			weapon2h: [],
			shield: [],
		};
		this.armorPart = count(['head', 'chest', 'hands', 'feet', 'belt', 'ring', 'ring', 'amulet']);
		this.weaponPart = [count(['weapon1h', 'shield']), count(['weapon2h']), 
		                   count(['weapon1h', 'weapon1h'])];
	},

	hasCount: function(c) {
		var th = this;
		var has = all(c, function (v, k) { 
			var res = th.matchedParts[k].length >= v;
			return res; 
		});
		return has;
	},

	// Pulls items in a "recipe" (a map of strings to counts) from this.matchedParts into a second array.
	// This will be reported to the used.
	extractItems: function(recipe) {
		var th = this;
		return $.map(recipe, function (v, k) {
			var out = [];
			for (var countNeeded = v; countNeeded > 0; --countNeeded) {
				out.push(th.matchedParts[k].pop());
			};
			return out;
		});
	},

	// If the requirements are satisfied, returns a minimal satisfying set of requirements.
	// Otherwise, returns the maximal satisfying set.
	getMatchRequirements: function() {
		var th = this;
		var weaponReqs = any(this.weaponPart, function (v, _) { return th.hasCount(v); });
		if (weaponReqs) {
			return mapMax([this.armorPart, weaponReqs[0]]);
		} else {
			return mapMax($.merge([this.armorPart], this.weaponPart));
		}
	},

	getCompleteMatches: function() {
		var matches = [];
		while (true) {
			var matchRequirements = this.getMatchRequirements();
			if (this.hasCount(matchRequirements)) {
				matches.push({complete: 1, items: this.extractItems(matchRequirements)});
			} else {
				break;
			}
		}
		return matches;
	},

	getMatches: function() {
		var th = this;
		var matches = this.getCompleteMatches();

		// The last one is a partial match. This is pretty tricky to represent. What we're going to
		// do is return the values of matchedParts as the items. We'll figure out what parts aren't
		// complete by iterating over the min key values of this.combos against the length of each
		// array in items. Completeness will be the length of 1 - (missing parts / missing+available).
		var requirements = this.getMatchRequirements();
		var missing = $.map(this.matchedParts, function (v, k) {
			var out = [];
			for (var missingCount = requirements[k] - v.length; missingCount > 0; --missingCount) {
				out.push(k);
			}
			return out;
		});
		// Get a composition of items that represents a partial suit. The slice is to prevent taking
		// more than required (we only want one chest, etc. for the partial match).
		var partialItems = $.map(this.matchedParts, 
								 function (v, k) { 
								 	if (requirements[k]) {
								 		return v.slice(0, requirements[k]); 
								 	}
								 });
		if (missing.length) {
			var firstMissingRow = sprintf('%s %sitems in slots:',
										  this.rarity, this.topQuality ? '20% quality ' : '');
			missing = $.merge([firstMissingRow], missing);
		}
		matches.push({complete: 1 - ((missing.length * 1.0) / (missing.length + partialItems.length)), 
					  items: partialItems, 
					  missing: missing});
		return matches;
	},

	take: function(i) {
		if (this.rarity != i.rarity) { return false; }
		if (this.topQuality && i.quality < 20) { return false; }
		if (i.category in this.matchedParts) {
			this.matchedParts[i.category].push(i);
		}
	},
})

function allMatches(items) {
	var available = items.slice(0);
	var results = {
	};
	var matchRules = $.map([
		{result: "Gemcutter's Prism", matcher: new QualityMatch('skillGem'), lock:0.5, display:0.3},
		{result: "Regal Orb", matcher: new FullsetMatch('rare', true), lock: 0.2, display:0.1},
		{result: "Divine Orb", matcher: SocketMatch(6, true)},
		{result: "Jeweler's Orb", matcher: SocketMatch(6, false)},
		{result: "Orb of Alchemy", matcher: new RarenameMatch(2), lock:0.51},
		{result: "Orb of Alchemy", matcher: new BaseTypeMatch(['rare', 'magical', 'normal'], true), 
		 lock:0.51},
		{result: "Chaos Orb", matcher: new FullsetMatch('rare', false), lock: 0.6, display:0.3},
		{result: "5x Orb of Chance", matcher: new BaseTypeMatch(['unique', 'rare', 'magical', 'normal']),
		 lock:0.7, display: 0.5},
		{result: "Chromatic Orb", matcher: TricolorMatch()},
		{result: "Orb of Augmentation", matcher: new BaseTypeMatch(['rare', 'magical', 'normal'], false), 
		 lock:0.51},
		{result: "Orb of Augmentation", matcher: RareModMatch(6)},
		{result: "Armorer's Scrap", matcher: new QualityMatch('armor'), lock:0.98},
		{result: "Blacksmith's Whetstone", matcher: new QualityMatch('weapon'), lock:0.98},
		{result: "Glassblower's Bauble", matcher: new QualityMatch('flask')}
	], function (v, _) {
		// Defaults.
		if (v.lock == null) { v.lock = 0; }
		if (v.display == null) { v.display = v.lock; }
		return v;
	});
	$.each(matchRules, function (_, rule) {
		var matcher = rule.matcher;
		$.map(available, function (i) { matcher.take(i); })
		var matches = (matcher.getMatches()
			           .filter(function(m) { return m.complete > rule.display; }));
		var completeMatchItems = $.map(matches, function (v, _) {
			if (v.complete > rule.lock) {
				return v.items;
			}
		});
		// available = available, less any items in complete match items.
		available = available.filter(function (v, _) {  return $.inArray(v, completeMatchItems) < 0 });

		// Remove from available anything in matches with complete portion > returnUnused.
		if (matches.length) {
			if (results[rule.result] == null) {
				results[rule.result] = []
			}
			results[rule.result] = $.merge(results[rule.result], matches);
		}
	});
	return results;
}

function locationFormat(i) {
	if (i.location.section == 'character') { return 'char'; }
	else { return sprintf('stash p%d', i.location.page + 1); }
}

function itemSpan(i) {
	return sprintf('%s&nbsp;&nbsp;&nbsp;&nbsp<span class="location">%s</span>', i.name, locationFormat(i));
}
