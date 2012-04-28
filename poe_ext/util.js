function flatten(ar) {
	return $.map(ar, function (i) { return i; });
}

function count(map) {
	var out = {}
	$.each(map, function (v, k) {
		if (!(k in out)) {
			out[k] = 0;
		}
		out[k] += 1;
	});
	return out;
}

function any(collection, f) {
	var ok = false;
	var res = $.map(collection, function (v, k) {
		if (f(v, k)) { ok=true; return v; } 
	});
	if (ok) { return res; } else { return null; }
}

function all(collection, f) {
	return !any(collection, function (v, k) { return !f(v, k)})
}
