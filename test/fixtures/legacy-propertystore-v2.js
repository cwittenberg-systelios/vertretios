/* === Property-Store (gechunkt, Copy-on-Write) — ersetzt RestStore als Persistenz.
   Content-Properties erscheinen NICHT im Activity-Feed -> rauschfreies Speichern.
   Der Alt-Anhang bleibt als Backup erhalten und wird nur einmalig migriert. === */
function PropertyStore(){
  var MKEY="wpstore";            // Manifest-Property: {v,gen,n,count}
  var SAFE=30000;                // max. serialisierte Zeichen je Chunk (Reserve unter 32768)
  var CLEAN_SLACK=8;             // Aufraeum-Reserve fuer verwaiste Chunks abgebrochener Saves
  var OLD_FILES=["wpdata.json","ap-data.json"]; // Alt-Anhaenge als Migrationsquelle (erste mit Daten gewinnt)
  var state={gen:0,n:0,sfx:null}; // aktive Generation + Chunk-Anzahl + Chunk-Nonce (null = Legacy-Schluesselform)
  var vers={};                   // key -> bekannte version.number (create-or-update)

  function CKEY(g,i,sfx){return sfx?(MKEY+"-"+g+"-"+sfx+"-"+i):(MKEY+"-"+g+"-"+i);}
  function purl(key){return "/rest/api/content/"+PID+"/property"+(key?"/"+encodeURIComponent(key):"");}
  function jhead(ct){var h={"X-Atlassian-Token":"no-check","Accept":"application/json"};if(ct)h["Content-Type"]="application/json";return h;}

  // String greedy so teilen, dass jeder Chunk SERIALISIERT (inkl. Escaping) <= SAFE bleibt.
  function packString(s){
    var chunks=[],i=0,n=s.length;
    while(i<n){
      var lo=1,hi=Math.min(n-i,SAFE);
      while(lo<hi){var mid=Math.ceil((lo+hi)/2);if(JSON.stringify(s.substr(i,mid)).length<=SAFE)lo=mid;else hi=mid-1;}
      chunks.push(s.substr(i,lo));i+=lo;
    }
    return chunks.length?chunks:[""];
  }
  function chunkVal(cp){var v=cp&&cp.value;if(v&&typeof v.d==="string")return v.d;return typeof v==="string"?v:"";}

  /* ---- async REST (fetch) ---- */
  function getProp(key){return fetch(CTX+purl(key),{credentials:"same-origin",headers:jhead(false)}).then(function(r){if(r.status===404)return null;if(!r.ok)throw new Error("prop GET "+key+" -> "+r.status);return r.json();});}
  function setProp(key,value){
    var known=vers[key];
    function put(v){return fetch(CTX+purl(key),{method:"PUT",credentials:"same-origin",headers:jhead(true),body:JSON.stringify({value:value,version:{number:v}})}).then(function(r){if(!r.ok)throw new Error("prop PUT "+key+" -> "+r.status);vers[key]=v;return true;});}
    function recover(){return getProp(key).then(function(p){var v=(p&&p.version&&p.version.number)||0;return put(v+1);});}
    if(known)return put(known+1).catch(recover);
    return fetch(CTX+purl(""),{method:"POST",credentials:"same-origin",headers:jhead(true),body:JSON.stringify({key:key,value:value})}).then(function(r){
      if(r.ok){vers[key]=1;return true;}
      if(r.status===409||r.status===400)return recover();
      throw new Error("prop POST "+key+" -> "+r.status);
    });
  }
  function delProp(key){return fetch(CTX+purl(key),{method:"DELETE",credentials:"same-origin",headers:jhead(false)}).then(function(){delete vers[key];return true;}).catch(function(){return true;});}
  function writeModel(m){
    var chunks=packString(JSON.stringify(m));
    var oldGen=state.gen,oldN=state.n,oldSfx=state.sfx,newGen=oldGen+1;
    var seq=Promise.resolve();
    chunks.forEach(function(part,i){seq=seq.then(function(){return setProp(CKEY(newGen,i),{d:part});});});
    seq=seq.then(function(){return setProp(MKEY,{v:2,gen:newGen,n:chunks.length,count:(m&&m.requests?m.requests.length:0)});});
    return seq.then(function(){
      state={gen:newGen,n:chunks.length,sfx:null};
      var dels=[],i;for(i=0;i<oldN+CLEAN_SLACK;i++)dels.push(CKEY(oldGen,i,oldSfx));
      for(i=chunks.length;i<chunks.length+CLEAN_SLACK;i++)dels.push(CKEY(newGen,i));
      return Promise.all(dels.map(delProp)).then(function(){return true;});
    });
  }

  /* ---- sync REST (XHR) fuer beforeunload/visibilitychange ---- */
  function sx(method,key,body){var x=new XMLHttpRequest();x.open(method,CTX+purl(key),false);x.setRequestHeader("X-Atlassian-Token","no-check");x.setRequestHeader("Accept","application/json");if(body!=null)x.setRequestHeader("Content-Type","application/json");try{x.send(body!=null?JSON.stringify(body):null);}catch(e){return {status:0,text:""};}return {status:x.status,text:x.responseText};}
  function sxPost(key,value){var x=new XMLHttpRequest();x.open("POST",CTX+purl(""),false);x.setRequestHeader("X-Atlassian-Token","no-check");x.setRequestHeader("Accept","application/json");x.setRequestHeader("Content-Type","application/json");try{x.send(JSON.stringify({key:key,value:value}));}catch(e){return {status:0};}return {status:x.status};}
  function setPropSync(key,value){
    function putV(v){var r=sx("PUT",key,{value:value,version:{number:v}});if(r.status>=200&&r.status<300){vers[key]=v;return true;}return false;}
    function refetchPut(){var g=sx("GET",key,null);var v=0;try{v=(JSON.parse(g.text).version.number)||0;}catch(e){}putV(v+1);}
    var known=vers[key];
    if(known){if(!putV(known+1))refetchPut();return;}
    var p=sxPost(key,value);if(p.status>=200&&p.status<300){vers[key]=1;return;}
    refetchPut();
  }
  function delPropSync(key){sx("DELETE",key,null);delete vers[key];}
  function writeModelSync(m){
    var chunks=packString(JSON.stringify(m));
    var oldGen=state.gen,oldN=state.n,oldSfx=state.sfx,newGen=oldGen+1,i;
    for(i=0;i<chunks.length;i++)setPropSync(CKEY(newGen,i),{d:chunks[i]});
    setPropSync(MKEY,{v:2,gen:newGen,n:chunks.length,count:(m&&m.requests?m.requests.length:0)});
    state={gen:newGen,n:chunks.length,sfx:null};
    for(i=0;i<oldN+CLEAN_SLACK;i++)delPropSync(CKEY(oldGen,i,oldSfx));
    for(i=chunks.length;i<chunks.length+CLEAN_SLACK;i++)delPropSync(CKEY(newGen,i));
  }

  /* ---- Migration vom Alt-Anhang (einmalig, idempotent) ---- */
  function readAttachment(fn){
    return jget("/rest/api/content/"+PID+"/child/attachment?filename="+encodeURIComponent(fn)+"&expand=version").then(function(d){
      var a=(d.results&&d.results[0])||null;if(!a)return null;
      return fetch(CTX+"/download/attachments/"+PID+"/"+encodeURIComponent(fn)+"?cb="+Date.now(),{credentials:"same-origin"}).then(function(r){if(!r.ok)return null;return r.json();});
    }).catch(function(){return null;});
  }
  function readOldAttachment(){return OLD_FILES.reduce(function(p,fn){return p.then(function(found){return found?found:readAttachment(fn);});},Promise.resolve(null));}
  function migrate(){return readOldAttachment().then(function(data){if(data&&typeof data==="object")return writeModel(data).then(function(){return data;});return null;});}

  /* ============================================================
     Nebenlaeufigkeit (siehe confluence-property-macro-concurrency.md)
     Versions-Primitiv im gechunkten Store: Manifest-Generation `gen`
     (monoton) + Manifest-Property-Version als optimistisches Schloss.
     ============================================================ */

  // Chunk NUR anlegen (kein Overwrite): kollidiert die Generation mit einem
  // fremden In-Flight-Save, markiert 409/400 den Konflikt statt zu ueberschreiben.
  function setChunkNew(key,value){
    return fetch(CTX+purl(""),{method:"POST",credentials:"same-origin",headers:jhead(true),body:JSON.stringify({key:key,value:value})}).then(function(r){
      if(r.ok){vers[key]=1;return true;}
      if(r.status===409||r.status===400){var e=new Error("collision "+key);e.conflict=true;throw e;}
      throw new Error("prop POST "+key+" -> "+r.status);
    });
  }
  // Compare-and-Swap auf dem Manifest: KEIN stilles recover() -> 409 = echter Konflikt.
  function casManifest(value,baseVer){
    if(baseVer){
      return fetch(CTX+purl(MKEY),{method:"PUT",credentials:"same-origin",headers:jhead(true),body:JSON.stringify({value:value,version:{number:baseVer+1}})}).then(function(r){
        if(r.ok){vers[MKEY]=baseVer+1;return true;}
        if(r.status===409){var e=new Error("manifest 409");e.conflict=true;throw e;}
        throw new Error("manifest PUT -> "+r.status);
      });
    }
    return fetch(CTX+purl(""),{method:"POST",credentials:"same-origin",headers:jhead(true),body:JSON.stringify({key:MKEY,value:value})}).then(function(r){
      if(r.ok){vers[MKEY]=1;return true;}
      if(r.status===409||r.status===400){var e=new Error("manifest exists");e.conflict=true;throw e;}
      throw new Error("manifest POST -> "+r.status);
    });
  }
  function cleanupGen(gen,count,sfx){var dels=[],i;for(i=0;i<count+CLEAN_SLACK;i++)dels.push(CKEY(gen,i,sfx));return Promise.all(dels.map(delProp));}

  // Liest Manifest + Chunks OHNE Seiteneffekt auf state/vers[MKEY] (Rollback bleibt korrekt).
  function loadFresh(){
    return getProp(MKEY).then(function(p){
      if(!p)return {model:null,gen:0,n:0,ver:0,sfx:null};
      var man=p.value;if(typeof man==="string"){try{man=JSON.parse(man);}catch(e){man=null;}}
      var ver=(p.version&&p.version.number)||0;
      var sfx=(man&&man.sfx)||null;
      if(!man||man.v!==2||!man.n)return {model:null,gen:(man&&man.gen)||0,n:(man&&man.n)||0,ver:ver,sfx:sfx};
      var idx=[],i;for(i=0;i<man.n;i++)idx.push(i);
      return Promise.all(idx.map(function(i){return getProp(CKEY(man.gen,i,sfx)).then(function(cp){if(!cp)throw new Error("Chunk fehlt: "+CKEY(man.gen,i,sfx));return chunkVal(cp);});})).then(function(parts){return {model:JSON.parse(parts.join("")),gen:man.gen,n:man.n,ver:ver,sfx:sfx};});
    });
  }

  // Optimistisches Speichern mit granularem Konflikt-Replay.
  // Happy Path: neue Generation schreiben + Manifest-CAS. Bei Konflikt
  // (Chunk-Kollision ODER Manifest-409): frischen Stand holen, eigenes Delta
  // via replay(base) neu anwenden, an hoeherer Generation erneut speichern.
  // Resolved mit dem TATSAECHLICH persistierten (ggf. zusammengefuehrten) Modell.
  function newSfx(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function saveMerge(localModel,replay){
    function attempt(m,baseGen,baseN,baseVer,baseSfx,tries){
      var newGen=baseGen+1;
      var sfx=newSfx();                                   // pro Versuch eindeutige Chunk-Nonce -> keine Kollision zwischen Tabs
      var chunks=packString(JSON.stringify(m));
      var seq=Promise.resolve();
      chunks.forEach(function(part,i){seq=seq.then(function(){return setChunkNew(CKEY(newGen,i,sfx),{d:part});});});
      return seq.then(function(){
        return casManifest({v:2,gen:newGen,n:chunks.length,count:(m&&m.requests?m.requests.length:0),sfx:sfx},baseVer);
      }).then(function(){
        state={gen:newGen,n:chunks.length,sfx:sfx};
        // Basis-Chunks (mit ihrer eigenen Nonce) + eigener Slack aufraeumen
        var dels=[],i;for(i=0;i<baseN+CLEAN_SLACK;i++)dels.push(CKEY(baseGen,i,baseSfx));
        for(i=chunks.length;i<chunks.length+CLEAN_SLACK;i++)dels.push(CKEY(newGen,i,sfx));
        return Promise.all(dels.map(delProp)).then(function(){return m;});
      }).catch(function(err){
        if(err&&err.conflict&&tries<3){
          // nur die EIGENEN gerade geschriebenen Chunks entfernen (Gewinner-Chunks bleiben unberuehrt),
          // dann frischen Stand holen, eigenes Delta neu anwenden, an hoeherer Generation erneut speichern.
          return cleanupGen(newGen,chunks.length,sfx).then(loadFresh).then(function(fr){
            var merged=replay?replay(fr.model||{version:m&&m.version,config:{},requests:[]}):m;
            return attempt(merged,fr.gen,fr.n,fr.ver,fr.sfx,tries+1);
          });
        }
        throw err;
      });
    }
    return attempt(localModel,state.gen,state.n,vers[MKEY]||0,state.sfx,0);
  }

  // Guenstiger Poll: nur Manifest lesen, Generation zurueckgeben (Baustein 1).
  function peekServerGen(){
    return getProp(MKEY).then(function(p){
      if(!p)return 0;
      var man=p.value;if(typeof man==="string"){try{man=JSON.parse(man);}catch(e){man=null;}}
      return (man&&man.gen)||0;
    }).catch(function(){return state.gen;});
  }

  return {
    saveMerge:function(m,replay){return saveMerge(m,replay);},
    peekServerGen:peekServerGen,
    currentGen:function(){return state.gen;},
    name:"property",
    load:function(){
      return getProp(MKEY).then(function(p){
        var man=p&&p.value;if(typeof man==="string"){try{man=JSON.parse(man);}catch(e){man=null;}}
        if(!p||!man||man.v!==2)return migrate();
        vers[MKEY]=(p.version&&p.version.number)||1;state={gen:man.gen,n:man.n,sfx:(man.sfx||null)};
        if(!man.n)return null;
        var idx=[],i;for(i=0;i<man.n;i++)idx.push(i);
        return Promise.all(idx.map(function(i){var key=CKEY(man.gen,i,state.sfx);return getProp(key).then(function(cp){if(!cp)throw new Error("Chunk fehlt: "+key);vers[key]=(cp.version&&cp.version.number)||1;return chunkVal(cp);});})).then(function(parts){return JSON.parse(parts.join(""));});
      });
    },
    save:function(m){return writeModel(m);},
    saveSync:function(m){try{writeModelSync(m);}catch(e){if(window.console)console.warn("[WP] saveSync:",e);}},
    reset:function(){return Promise.resolve();}
  };
}
