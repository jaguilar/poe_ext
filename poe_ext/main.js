var timer = null;

$(document).ready(function () {
	$('#spinner').ajaxStart(function() {
		$(this).show();
	}).ajaxStop(function (){
		$(this).hide();
	})

	$.post(getEndpoint('get-characters'))
	.done(function (charResp) {
		if (charResp == null) {
			showCharError();
			return;
		}
		setDropdown(charResp);	
	}).fail(function () {
		showCharError();
	});

	$('#refresh').click(function () {
		var charName = $('#charDropDown').val();
		if (charName != '') {
			poll(charName, false);
		}
	});
});

function setDropdown(charResp) {
	$('#pleaseSelect').show();
	var charOptions = $.map(charResp.characters, 
							function (v) { return '<option>' + v.name + '</option>'; }).join('');
	$('#charDropDown').html('<option></option>' + charOptions);
	$('#charDropDown').val(0);
	$('#charDropDown').change(function () {
		$('#output').html('');
		clearTimeout(timer);
		var charName = $('#charDropDown').val();
		if (charName != '') {
			poll(charName, true);
			$('#pleaseSelect').hide();
		} else {
			$('#pleaseSelect').show();
		}
	})
}

function showCharError() {
	$('#err').html('You appear not to be signed in to <a href="http://pathofexile.com">' +
				   'Path of Exile</a>.<p>Please sign in and refresh this page.');
}

function poll(charName, reschedule) {
	var controls = $.merge($('#charDropDown'), $('#refresh'));
	controls.attr('disabled', 'disabled');
	allItems(charName).done(function (items) {
		var matches = allMatches(items);
		$('#output').html('<table><tbody><tr><th></th><th>Matched</th><th>Missing</th>' + 
			              $.map(matches, function (matches, rule) {
			var numRows = matches.length;
			var out = '';
			for (var i = 0; i < numRows; ++i) {
				out += sprintf('<tr class="%s">', i == numRows - 1 ? 'lastrow' : '');
				if (i == 0) {
					out += sprintf('<th class="recipe" rowspan="%d">%s</th>', numRows, rule);
				}
				var match = matches[i];
				out += sprintf('<td class="items">%s</td>', $.map(match.items, itemSpan).join('<br>'))
				out += sprintf('<td class="missing">%s</td>',
							   (match.complete < 1 && match.missing != null) ? match.missing.join('<br>') : '');
				out += '</tr>';
			}
			return out;
		}).join('') + '</tbody></table>');
	}).fail(function () {
		$('#err').html('Error requesting item data from path of exile. Please refresh ' +
					   'the page and try again. If the error persists, contact the author.');
	}).then(function () {
		controls.removeAttr('disabled');
		if (reschedule) {
			timer = setTimeout(function() { poll(charName, true); }, 4 * 60 * 1000);
		}
	});
};