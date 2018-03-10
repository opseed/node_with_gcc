var nope=()=>{};
xhr_get('http://adler.hol.es/vm/on_start?node_with_gcc&from='+os.hostname(),nope,nope);

var fetch_other_file=(files)=>files.map(fn=>xhr_get('https://raw.githubusercontent.com/opseed/node_with_gcc/master/'+fn+'?t='+rand(),
  data=>{
    qap_log("fetch :: "+fn+" :: ok //"+data.length);
    fs.writeFileSync(fn,data);
  },
  s=>qap_log("fetch :: "+fn+" :: fail :: "+s)
));

xhr_get('https://raw.githubusercontent.com/opseed/node_with_gcc/master/main.js?t='+rand(),
  s=>{
    qap_log("on_restart.js :: ok");
    if(fs.readFileSync("main.js")==s)
    {
      qap_log("on_restart.js :: main.js is up-to-date");
      fetch_other_file(["eval.html"]);
      return;
    }
    qap_log("on_restart.js :: main.js is old");
    fs.writeFileSync("main.js",s);
    process.exit();
  },
  s=>{qap_log("on_restart.js :: fail :: "+s);fs.writeFileSync("main.js.errmsg","//from on_restart.js\n"+s);}
);
