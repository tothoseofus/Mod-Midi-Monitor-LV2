/* MOD GUI JavaScript callback supplied to the host by MOD's template loader. */
function(event) {
    if (event.type !== 'change') return;
    var root = event.icon || event.settings;
    if (!root) return;
    var el = root.jquery ? root[0] : root;
    var find = function(selector) { return el.querySelector(selector); };
    if (event.symbol === 'count') {
        var counter=find('.probe-count');
        if (counter) counter.textContent=String(Math.round(event.value));
    }
    if (event.symbol === 'status' || event.symbol === 'data1' || event.symbol === 'data2') {
        if (!el._probeBytes) el._probeBytes={status:0,data1:0,data2:0};
        el._probeBytes[event.symbol]=Math.round(event.value);
        var hex=function(v){ return ('0'+v.toString(16).toUpperCase()).slice(-2); };
        var output=find('.probe-bytes');
        if(output) output.textContent=[hex(el._probeBytes.status),hex(el._probeBytes.data1),hex(el._probeBytes.data2)].join(' ');
    }
}
