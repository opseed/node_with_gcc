const util = require('util');
const vm = require('vm');

var child_process=require('child_process');
var execSync=child_process.execSync;var exec=child_process.exec;
var spawnSync=child_process.spawnSync;var spawn=child_process.spawn;

var qs = require('querystring');
var http = require("http"),
    https = require("https"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    os = require("os"),
    process = require('process'),
    crypto = require('crypto');

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if(process.argv.length>=3){
  port=process.argv[2]|0;
}

var get_tick_count=()=>new Date().getTime();
var get_ms=()=>{var a=process.hrtime();return a[0]*1e3+a[1]/1e6;}
var unixtime=()=>(new Date()/1000);

var g_interval=false;var g_ping_base=get_tick_count();
var g_obj={};

var QapNoWay=()=>{qap_log("QapNoWay :: no impl");qap_log("no way");}

var call_cb_on_err=(emitter,cb,...args)=>{
  emitter.on('error',err=>{
    cb("'inspect({args,err}) // stack': "+inspect({args:args,err:err})+" // "+err.stack.toString());
  });
}

var qap_err=(context,err)=>context+" :: err = "+inspect(err)+" //"+err.stack.toString();
var log_err=(context,err)=>qap_log(qap_err(context,err));

process.on('uncaughtException',err=>log_err('uncaughtException',err));

var rand=()=>(Math.random()*1024*64|0);
var qap_add_time=s=>"["+getDateTime()+"] "+s;
var qap_log=s=>console.log(qap_add_time(s));

var json=JSON.stringify;
var mapkeys=Object.keys;var mapvals=(m)=>mapkeys(m).map(k=>m[k]);
var inc=(m,k)=>{if(!(k in m))m[k]=0;m[k]++;return m[k];};

var FToS=n=>(n+0).toFixed(2);
var mapswap=(k2v)=>{var v2k={};for(var k in k2v){v2k[k2v[k]]=k;}return v2k;}
var qapavg=(arr,cb)=>{if(typeof cb=='undefined')cb=e=>e;return arr.length?arr.reduce((pv,ex)=>pv+cb(ex),0)/arr.length:0;}
var qapsum=(arr,cb)=>{if(typeof cb=='undefined')cb=e=>e;return arr.reduce((pv,ex)=>pv+cb(ex),0);}
var qapmin=(arr,cb)=>{if(typeof cb=='undefined')cb=e=>e;var out;var i=0;for(var k in arr){var v=cb(arr[k]);if(!i){out=v;}i++;out=Math.min(out,v);}return out;}
var qapmax=(arr,cb)=>{if(typeof cb=='undefined')cb=e=>e;var out;var i=0;for(var k in arr){var v=cb(arr[k]);if(!i){out=v;}i++;out=Math.max(out,v);}return out;}
var qapsort=(arr,cb)=>{if(typeof cb=='undefined')cb=e=>e;return arr.sort((a,b)=>cb(b)-cb(a));}
var mapdrop=(e,arr,n)=>{var out=n||{};Object.keys(e).map(k=>arr.indexOf(k)<0?out[k]=e[k]:0);return out;}
var mapsort=(arr,cb)=>{if(typeof cb=='undefined')cb=(k,v)=>v;var out={};var tmp=qapsort(mapkeys(arr),k=>cb(k,arr[k]));for(var k in tmp)out[tmp[k]]=arr[tmp[k]];return out;}

var qap_unique=arr=>{var tmp={};arr.map(e=>tmp[e]=1);return mapkeys(tmp);};var unique_arr=qap_unique;

var mapaddfront=(obj,n)=>{for(var k in obj)n[k]=obj[k];return n;}
var mapclone=obj=>mapaddfront(obj,{});

var getarr=(m,k)=>{if(!(k in m))m[k]=[];return m[k];};
var getmap=(m,k)=>{if(!(k in m))m[k]={};return m[k];};
var getdef=(m,k,def)=>{if(!(k in m))m[k]=def;return m[k];};

var qap_foreach_key=(obj,cb)=>{for(var k in obj)cb(obj,k,obj[k]);return obj;}

var json_once=(obj,replacer,indent,limit)=>{
  var objs=[];var keys=[];if(typeof(limit)=='undefined')limit=2048;
  return json(obj,(key,v)=>{
    if(objs.length>limit)return 'object too long';
    var id=-1;objs.forEach((e,i)=>{if(e===v){id=i;}});
    if(key==''){objs.push(obj);keys.push("root");return v;}
    if(id>=0){
      return keys[id]=="root"?"(pointer to root)":
        ("\1(see "+((!!v&&!!v.constructor)?v.constructor.name.toLowerCase():typeof(v))+" with key "+json(keys[id])+")");
    }else{
      if(v!==null&&typeof(v)==="object"){var qk=key||"(empty key)";objs.push(v);keys.push(qk);}
      return replacer?replacer(key,v):v;
    }
  },indent);
};
var json_once_v2=(e,v,lim)=>json_once(e,v,2,lim);
var inspect=json_once_v2;

function getDateTime() {
  var now     = new Date(); 
  var year    = now.getFullYear();
  var f=v=>(v.toString().length==1?'0':'')+v;
  var month   = f(now.getMonth()+1); 
  var day     = f(now.getDate());
  var hour    = f(now.getHours());
  var minute  = f(now.getMinutes());
  var second  = f(now.getSeconds()); 
  var dateTime = year+'.'+month+'.'+day+' '+hour+':'+minute+':'+second;   
  return dateTime;
}

var parse_wmdatetime=s=>{
  var t=s.split(' ');var ymd=t[0].split('.').reverse();var hms=t[1].split(':');
  return new Date(ymd[0],ymd[1],ymd[2],hms[0],hms[1],hms[2]);
}
//parse_wmdatetime("28.02.2018 18:42:43");

var emitter_on_data_decoder=(emitter,cb)=>{
  var rd=Buffer.from([]);
  var err=qap_log;
  emitter.on('data',data=>{
    rd=Buffer.concat([rd,data]);
    var e=rd.indexOf("\0");
    if(e<0)return;
    var en=e+1;
    var zpos=rd.indexOf('\0',en);
    if(zpos<0)return;
    var zn=zpos+1;
    var blen=rd.slice(0,e);
    var len=blen.toString("binary")|0;
    if(!Buffer.from((len+"").toString("binary")).equals(blen)){
      err("error chunk.len is not number: "+json({as_buff:blen,as_str:blen.toString("binary")}));
    }
    if(rd.length<zn+len)return;
    var bz=rd.slice(en,en+zpos-en);var z=bz.toString("binary");
    var bmsg=rd.slice(zn,zn+len);var msg=bmsg.toString("binary");
    rd=rd.slice(zn+len);
    cb(z,msg,bz,bmsg);
  });
}

var stream_write_encoder=(stream,z)=>data=>{
  var sep=Buffer.from([0]);
  stream.write(Buffer.concat([
    Buffer.from(!data?"0":(data.length+""),"binary"),sep,
    Buffer.from(z,"binary"),sep,
    Buffer.from(data?data:"","binary")
  ]));
};

var cl_and_exec_cpp=(code,async_cb,flags)=>{
  var rnd=rand()+"";rnd="00000".substr(rnd.length)+rnd;
  var fn="main["+getDateTime().split(":").join("-").split(" ").join("_")+"]_"+rnd+".cpp";
  var out="./"+fn+".out";
  //fn=json(fn);out=json(out);
  fs.writeFileSync(fn,code);
  var cmdline="g++ "+(flags?flags:"")+"-Wmultichar -fpermissive -DQAP_DEBUG -std=c++11 "+fn+" -O2 -o "+out+"\n"+out;
  if(async_cb){
    if((typeof async_cb)!="function")async_cb=()=>{};
    var proc=exec(cmdline,async_cb);
    return "async...";
  }
  return ""+execSync(cmdline);
}

var get_backup=()=>{
  var tmp=JSON.parse(json(g_obj));var data=json(mapdrop(mapclone(g_obj),'g_obj.json'));
  getarr(tmp,'g_obj.json').push({
    time:getDateTime(),
    hostname:os.hostname(),
    host:g_conf_info.last_request_host,
    size:Buffer.byteLength(data),
    sha1:crypto.createHash('sha1').update(data).digest('hex')
  });
  return tmp;
}

var get_hosts_by_type=type=>mapkeys(hosts).filter(e=>hosts[e]==type);

var send_backup=()=>{
  var nope=()=>{};
  var fn=crypto.createHash('sha1').update(os.hostname()).digest('hex')+".json";
  var backup_servers=get_hosts_by_type('backup');
  backup_servers.map(e=>
    xhr_post('http://'+e+'/vm/backup/?write&from='+os.hostname(),{fn:fn,data:json(get_backup())},nope,nope)
  );
}

var g_intervals=[];

var set_interval=(func,ms)=>{
  g_intervals.push({data:getDateTime(),func:func,ref:setInterval(func,ms)});
  return g_intervals.slice(-1)[0];
}

var clear_interval=(ref)=>{
  clearInterval(ref.ref);g_intervals.splice(g_intervals.indexOf(ref),1);
}

var start_auto_backup=()=>{
  set_interval(send_backup,10*60*1000);
}
//return cl_and_exec_cpp(POST);

var ee_logger=(emitter,name,events)=>{
  events.split(',').map(event=>emitter.on(event,e=>qap_log(name+' :: Got '+event)));
}

var ee_logger_v2=(emitter,name,cb,events)=>{
  events.split(',').map(event=>emitter.on(event,e=>cb(name+' :: Got '+event)));
  call_cb_on_err(emitter,cb,name);
}

var xhr_get=(URL,ok,err)=>{
  if((typeof ok)!="function")ok=()=>{};
  if((typeof err)!="function")err=()=>{};
  var secure=['https:','https'].includes(url.parse(URL).protocol);
  var req=(secure?https:http).get(URL,(res)=>{
    var cb=ok;
    if(res.statusCode!==200){cb=(s,res)=>err('Request Failed.\nStatus Code: '+res.statusCode+'\n'+s);}
    //res.setEncoding('utf8');
    var rawData='';res.on('data',(chunk)=>rawData+=chunk.toString("binary"));
    res.on('end',()=>{try{cb(rawData,res);}catch(e){err(qap_err('xhr_get.mega_huge_error',e),res);}});
  });
  call_cb_on_err(req,qap_log,'xhr_get');
  return req;
}

var xhr=(method,URL,data,ok,err)=>{
  if((typeof ok)!="function")ok=()=>{};
  if((typeof err)!="function")err=()=>{};
  var up=url.parse(URL);var secure=['https:','https'].includes(up.protocol);
  var options={
    hostname:up.hostname,port:up.port?up.port:(secure?443:80),path:up.path,method:method.toUpperCase(),
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(data)}
  };
  var req=(secure?https:http).request(options,(res)=>{
    var cb=ok;
    if(res.statusCode!==200){cb=(s,res)=>err('Request Failed.\nStatus Code: '+res.statusCode+'\n'+s);}
    //res.setEncoding('utf8');
    var rawData='';res.on('data',(chunk)=>rawData+=chunk.toString("binary"));
    res.on('end',()=>{try{cb(rawData,res);}catch(e){err(qap_err('xhr.mega_huge_error',e),res);}});
  });
  call_cb_on_err(req,qap_log,'xhr');
  req.end(data);
  return req;
}

var xhr_add_timeout=(req,ms)=>req.on('socket',sock=>sock.on('timeout',()=>req.abort()).setTimeout(ms));

var xhr_post=(url,obj,ok,err)=>xhr('post',url,qs.stringify(obj),ok,err);
var xhr_post_with_to=(url,obj,ok,err,ms)=>xhr_add_timeout(xhr('post',url,qs.stringify(obj),ok,err),ms);

var axhr_get=(url,ud)=>{
  return new Promise((ok,err)=>xhr_get(url,
    s=>ok((typeof ud)==="undefined"?s:{ud:ud,data:s}),
    s=>err(new Error('axhr_get::'+inspect({url:url,userdata:ud,response_body:s})))
  ));
}

var axhr_post=(url,obj,ud)=>{
  return new Promise((ok,err)=>xhr_post(url,obj,
    s=>ok((typeof ud)==="undefined"?s:{obj:obj,ud:ud,data:s}),
    s=>err(new Error('axhr_post::'+inspect({obj:obj,url:url,userdata:ud,response_body:s})))
  ));
}

var split_stream=(stream,sep,cb,end)=>{
  if((typeof sep)!=typeof '')sep="\n";
  if((typeof cb)!='function')throw Error('no way. // wrong callback');
  if((typeof end)!='function')end=()=>{};
  var buff='';
  stream.on('data',s=>{
    var arr=(buff+s).split(sep);buff=arr.pop();arr.map(cb);
  }).on('end',s=>{if(buff.length)cb(buff);end();})
}
var split_reader=(fn,sep,cb,end)=>split_stream(fs.createReadStream(fn,'binary'),sep,cb,end);

var hosts={};var hosts_err_msg='';var need_coop_init=true;

var hosts_update=hosts=>{
  var conv=x=>{
    var out={power:{},host2vh:{},public:[]};
    for(var host in x.host2str){var a=x.host2str[host].split("|");out.host2vh[host]=a[0];out.power[a[0]]=a[1];}
    out.public=x.public.split("|").map(e=>mapswap(out.host2vh)[e]);
    mapkeys(x.host2str).map(k=>{if(out.public.includes(k))return;out.public.push(k);});
    return out;
  };
  hosts.main_out=conv(hosts.main);
  return hosts;
};

var hosts_sync=(cb)=>{
  if((typeof cb)!="function")cb=()=>{};
  xhr_get('https://raw.githubusercontent.com/adler3d/qap_vm/gh-pages/trash/test2017/hosts.json?t='+rand(),
    s=>{try{hosts=JSON.parse(s);hosts=hosts_update(hosts);}catch(e){cb('JSON.parse error:\n'+e+'\n\n'+s);}cb(s);},
    s=>{hosts_err_msg=s;cb(s);}
  );
};

hosts_sync();

var on_start_sync=()=>{
  if((typeof cb)!="function")cb=()=>{};
  xhr_get('https://raw.githubusercontent.com/opseed/node_with_gcc/master/on_restart.js?t='+rand(),
    s=>{fs.writeFileSync("on_restart.js",s);eval(s);},
    s=>{fs.writeFileSync("on_restart.js.errmsg",s);}
  );
};

on_start_sync();

var do_rollback_workers=()=>{
  var c=g_conf_info;
  c.arr.map((e,i)=>{
    if(!e.p)return;
    setTimeout(()=>xhr_get('http://'+e.host+'/rollback',qap_log,qap_log),i*2000);
  });
};

var request_to_log_object=request=>{
  var h=request.headers;
  return {
    time:getDateTime(),
    ip:h['x-forwarded-for']||request.connection.remoteAddress,
    request_uri:request.url,
    user_agent:h["user-agent"],
    method:request.method,
    referer:h.referer,
    host:request.headers.host,
    hostname:os.hostname()
  }
};
// TODO: think about bad story when: server got request, but hosts.json in loading stage...
var http_server=http.createServer((a,b)=>requestListener(a,b)).listen(port,ip);
var g_http_server_debug=true;var g_err_socks={};var g_err_socks_func=(err,socket)=>{
  if(inspect(socket.address())=="{}")return;
  var info={};(
    "bufferSize,bytesRead,bytesWritten,connecting,"+
    "destroyed,localAddress,localPort,remoteAddress,remotePort"
  ).split(",").map(e=>info[e]=socket[e]);
  var all={err:err,socket:info,incoming_headers:socket.parser.incoming.headers};
  getarr(g_err_socks,json(err)).push(all);
  var short_info={
    ip:all.incoming_headers["x-forwarded-for"],
    err:err,bytesRead:info.bytesRead,bytesWritten:info.bytesWritten
  };
  qap_log("http_server::on_clientError : "+json(short_info));
};
http_server.on('clientError',(err,socket)=>{
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  if(!g_http_server_debug)return;
  g_err_socks_func(err,socket);
});

var g_links={};
var gen_link_id=()=>{return rand()+" "+getDateTime();}
var new_link=()=>{var out={id:gen_link_id()};g_links[out.id]=out;return out;}

var requestListener=(request,response)=>{
  var purl=url.parse(request.url);var uri=purl.pathname;var qp=qs.parse(purl.query);
  var filename = path.join(process.cwd(), uri);

  qap_log("url = "+purl.path);
  
  if("/rt_sh"==uri)
  {
    response.writeHead(200,{"Content-Type":"text/plain",'Transfer-Encoding':'chunked','X-Content-Type-Options':'nosniff'});
    var toR=z=>stream_write_encoder(response,z);
    var ping=toR("ping");var iter=0;var ping_interval=set_interval(()=>ping(""+(iter++)),500);
    //toR("log")("["+getDateTime()+"] :: hi");
    var on_exit_funcs=[];
    var on_exit=()=>{
      if(!ping_interval)return;
      clear_interval(ping_interval);ping_interval=false;
      on_exit_funcs.map(f=>f());
      request.destroy();
      response.destroy();
    }
    var fromR=(z,msg,bz,bmsg)=>{if(z in z2func)z2func[z](msg,bmsg);};
    var mem={};
    var z2func={
      eval:msg=>{
        try{
          var system_tmp=eval("()=>{"+msg+"\n;return;}");
          system_tmp();
          return;
        }catch(err){
          QapNoWay();
          response.writeHead(500,{"Content-Type":"text/plain"});
          qap_log(qap_err("rt_sh.eval.msg",err));
          response.end(qap_err("rt_sh.eval.msg",err));
          on_exit();
          return;
        }
      }
    };
    emitter_on_data_decoder(request,fromR);
    ee_logger_v2(request,'rt_sh.request',qap_log,'end,abort,aborted,connect,continue,response,upgrade');
    ee_logger_v2(response,'rt_sh.response',qap_log,'end,abort,aborted,connect,continue,response,upgrade');
    request.on('aborted',on_exit);
    response.on('aborted',on_exit);
    return;
  }
  var contentTypesByExtension={
    '.html': "text/html", // "/eval.html" "/eval_hljs.html"
    '.css':  "text/css",
    '.js':   "text/javascript",
    '.txt':  "text/plain",
    '.php':  "text/plain",
    '.json':  "text/plain",
    '.log':  "text/plain", // "/mainloop.log"
    '.mem':  "application/octet-stream",
    '.bin':  "application/octet-stream",
    '.png':  "image/png",
    '.ico':  "image/x-icon",
    '.zip':  "application/zip",
    '.tar':  "application/x-tar",
    '.tgz':  "application/octet-stream",
    '.gz':  "application/gzip"
  };
  var on_request_end=(cb)=>{
    var body=[];
    call_cb_on_err(request,qap_log,'http_server.requestListener.on_request_end');
    request.on('data',chunk=>body.push(chunk));
    request.on('end',()=>cb(Buffer.concat(body).toString()));
  };
  call_cb_on_err(response,qap_log,'http_server.requestListener');
  var g_logger_func=request=>{
    var f=request=>{
      var h=request.headers;
      return {
        time:getDateTime(),
        ip:h['x-forwarded-for']||request.connection.remoteAddress,
        request_uri:request.url,
        user_agent:h["user-agent"],
        method:request.method,
        referer:h.referer
      }
    };
    var arr=getarr(getmap(g_obj,'logs'),os.hostname()).push(f(request));
  };
  on_request_end((POST_BODY)=>{
    var POST=POST_BODY.length?qs.parse(POST_BODY):{};
    mapkeys(POST).map(k=>qp[k]=POST[k]);POST=qp;
    g_logger_func(request);
    var is_dir=fn=>fs.statSync(filename).isDirectory();
    fs.exists(filename,ok=>{if(ok&&is_dir(filename))filename+='/index.html';func(filename);});
    var func=filename=>fs.exists(filename,function(exists) {
      var raw_quit=()=>{setTimeout(()=>process.exit(),16);}
      var quit=()=>{raw_quit();return txt("["+getDateTime()+"] ok");}
      var png=((res)=>{var r=res;return s=>{r.writeHead(200,{"Content-Type":"image/png"});r.end(new Buffer(s,"binary"));}})(response);
      var binary=((res)=>{var r=res;return s=>{r.writeHead(200,{"Content-Type":"application/octet-stream"});r.end(new Buffer(s,"binary"));}})(response);
      var txtbin=((res)=>{var r=res;return s=>{r.writeHead(200,{"Content-Type":"text/plain"});r.end(new Buffer(s,"binary"));}})(response);
      var html=((res)=>{var r=res;return s=>{r.writeHead(200,{"Content-Type":"text/html"});r.end(s);}})(response);
      var txt=((res)=>{var r=res;return s=>{r.writeHead(200,{"Content-Type":"text/plain"});r.end(s);}})(response);
      var async_cl_and_exec_cpp=(code,flags)=>{
        cl_and_exec_cpp(
          code,
          (error,stdout,stderr)=>txt(
            "so...\n"+(error?"err: "+inspect(error)+"\n"+stderr+"\n\n ***--- stdout: ---*** \n\n"+stdout:"ok: "+(stdout))
          ),
          flags
        );
      }
      var parse_json_lines=out=>JSON.parse("["+out.slice(0,-2)+"]");
      var exec_with_cb=(cmd,cb)=>{
        // bullshit. use exec(cmd,cb) instead. where cb=(err,so,se)=>{}
        var out='';var p=exec(cmd);
        p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>out+=s);
        p.on('exit',()=>cb(out));
        return p;
      }
      var isObject=a=>!!a&&a.constructor===Object;
      var exec_with_stream=(cmd,stream,cb)=>{
        if(typeof stream!=='object')throw Error('no way. // atm "typeof stream" = '+(typeof stream));
        if(typeof stream.write!=='function')throw Error('no way. // atm "typeof stream.write" = '+(typeof stream.write));
        var to_stream=s=>stream.write(s);
        var p=spawn('bash',[]);
        p.stdin.end(cmd+"\n");
        p.stdout.on('data',to_stream);
        p.stderr.on('data',to_stream);
        p.on('exit',cb?()=>cb(stream):()=>stream.end());
        return p;
      }
      var hack_require=((res)=>{var r=res;return (m,tarball)=>{
        try{require.resolve(m);}catch(e){
          r.write(m+" is not found, but ok, i already run 'npm install "+m+"'\n\n");
          exec_with_stream("echo npm install "+(tarball?tarball:m)+"\n npm install "+m,r);
          return false;//throw new Error('hack_require.fail');
        }
        return require(m);
      };})(response);
      //((res)=>{var r=res;return $$$;})(response);
      var shadows=get_hosts_by_type('shadow');
      var shadow=shadows[0];
      var master=get_hosts_by_type('public')[0];
      var req_handler=()=>{
        response.off=()=>response={writeHead:()=>{},end:()=>{},off:()=>{}};
        var resp_off=()=>{response.off();}
        var safe_promise_all_to=(err_cb,arr)=>Promise.all(arr).catch(err=>err_cb(qap_err('safe_promise_all',err)));
        var safe_promise_all=arr=>safe_promise_all_to(txt,arr);
        var jstable=arr=>{
          resp_off();
          //  safe_json=obj=>json(obj).split("</script>").join("<\\/script>");
          var safe_json=obj=>json(obj).split("/").join("\\/");
          var cb=data=>html(data.split("</body>").join("<script>document.title+='(node_with_gcc)';draw("+safe_json(arr)+");</script></body>"));
          fs.readFile("json2table_fish.html",(err,data)=>{if(err)throw err;cb(""+data);})
          return;
        };
        var jstable_right=arr=>{
          resp_off();
          var right=s=>s.split('<tbody>').join('<tbody align="right">');
          var safe_json=obj=>json(obj).split("/").join("\\/");
          var cb=data=>html(right(data).split("</body>").join("<script>document.title+='(node_with_gcc)';draw("+safe_json(arr)+");</script></body>"));
          fs.readFile("json2table_fish.html",(err,data)=>{if(err)throw err;cb(""+data);})
          return;
        }
        if("/api"==uri){
          if(!('a' in qp))return txt("param 'a' - required");
          if(qp.a=='get_backend'){
            if(!('task_id' in qp))return txt("param 'task_id' - required");
            var is_int=v=>((v|0)+'')===v;if(!is_int(qp.task_id))return txt("no way");
            return txt('no impl');
          }
          return txt('no impl');
        }
        if("/perform"==uri){
          return txt('wrong way');
          if(!('task_id' in qp))return txt("param 'task_id' - required");
          if(!('remotehost' in qp))return txt("remotehost - required");
          var is_int=v=>((v|0)+'')===v;if(!is_int(qp.task_id))return txt("no way");
          execSync("mkdir tmp");
          var tmp="./tmp/rnd"+rand();
          exec(
            "mkdir "+tmp+";cd "+tmp+";"+
            "curl "+qp.remotehost+"/api?a=get_backend?tmp="+tmp+"&task_id="+qp.task_id+">backend.zip|tee ./curl.backend.log;"+
            "unzip backend.zip|tee ./backend.unzip.log;"+
            "nohup nice -n15 ./start.sh 2>&1|tee ./start.sh.log",
            (err,so,se)=>{
              if(err)return qap_log("error at /perform:"+inspect(err));
              qap_log("task done: "+qp.task_id);
            }
          );
          return txt("ok. //"+getDateTime());
        }
        if("/g_obj.json"==uri){
          if('raw' in qp)return txt(json(g_obj));
          if('data' in qp)return json(mapdrop(mapclone(g_obj),'g_obj.json'));
          txtbin(json(get_backup()));
          return;
        }
        if("/hosts.json"==uri){
          hosts_sync(s=>txt(s));
          return;
        }
        if("/e"==uri){
          return txt("selfafiliate.txt");
        }
        if("/shadows_links"==uri){
          response.off();var ls='<a href="/fetch?quit">this/fetch?quit</a><hr><a href="/ls">this/ls</a>';
          return html(ls+"<hr>"+shadows.map(e=>"http://"+e+"/fetch?quit").map(e=>'<a href="'+e+'">'+e+'</a>').join("<hr>"));
        }
        var log_incdec_sumator=log=>{
          return log.map(e=>e.request_uri).map(e=>url.parse(e).pathname).
          map(e=>e=="/inc"?+1:(e=="/dec"?-1:0)).reduce((p,v)=>p+v,0);
        }
        var txt_conf_exec=cmd=>txt("conf = nwgcc\n"+execSync(cmd));
        if("/ll"==uri){return txt_conf_exec("ls -l");}
        if("/sysinfo"==uri)
        {
          var f=cmd=>execSync(cmd)+"";
          var mem=e=>"MemTotal,MemFree,MemAvailable".split(",").includes(e.split(":")[0]);
          return txt(
            f([
              "cat /proc/cpuinfo|grep 'model name'|awk 'NR==0;END{print}'",
              "cat /proc/cpuinfo|grep 'cache size'|awk 'NR==0;END{print}'",
              "cat /proc/cpuinfo|grep 'cpu MHz'|awk 'NR==0;END{print}'",
              "echo 'nproc --all : '`nproc --all`",
              "echo 'nproc       : '`nproc`",
              ""
            ].join("\n"))+"\n"+
            f("cat /proc/meminfo").split("\n").filter(mem).join("\n")
          );
        }
        if("/cpuinfo"==uri){return txt_conf_exec("cat /proc/cpuinfo");}
        if("/meminfo"==uri){return txt_conf_exec("cat /proc/meminfo");}
        if("/ps_aux"==uri){return txt_conf_exec('ps -aux|grep -v "<defunct>"');}
        if("/ps_aux_ll"==uri){return txt_conf_exec('ps -aux|grep -v "<defunct>"\nls -l');}
        if("/top"==uri){
          var files=getmap(g_obj,'files');
          var cb=arr=>jstable(arr);
          var filter=fn=>fn.indexOf("eval/rec[")<0;
          if('all' in qp)filter=any=>any;
          if('evalrecs' in qp)filter=fn=>fn.indexOf("eval/rec[")>=0;
          if('raw' in qp)cb=arr=>txt(inspect(arr));
          if('json' in qp)cb=arr=>txt(json(arr));
          return cb(qapsort(mapkeys(files).filter(filter).map(fn=>(
            {fn:fn,mass:log_incdec_sumator(files[fn].log)}
          )),e=>e.mass));
        }
        if("/mmll"==uri){
          var fn='mainloop.log';
          var pos=fs.statSync(fn).size-8*1024;
          if(pos<0)pos=0;
          fs.createReadStream(fn,{start:pos}).pipe(response);
          resp_off();
          return;
        }
        if("/evals"==uri)
        {
          var none=()=>{};
          var f=g_obj.files;
          if('drop_if_over4k' in qp)
          {
            var data_filter=e=>e?e.length>1024*4:e;
            return txt(
              mapkeys(f).filter(e=>e.includes("eval/")).reverse().
                map(e=>({fn:e,log_size:f[e].log.length,code:null,data:JSON.parse(f[e].data)})).
                filter(e=>data_filter(e.data.data)).
                map(e=>mapaddfront({code:e.data.code,data:data_filter(e.data.data)},e)).
                map(e=>({cmd:"http://vm-vm.1d35.starter-us-east-1.openshiftapps.com/del?fn="+e.fn})).
                map(e=>xhr_get(e.cmd,none,none)+"  "+e.cmd).join("\n")
            );
          }
          var data_filter=e=>(e?e.length>1024*4:e)?"*** over 4k ***":e;
          if('drop_if_trash' in qp)
          {
            var algo=e=>e?e.indexOf('trash')==0:0;
            return jstable(
              mapkeys(f).filter(e=>e.includes("eval/")).reverse().
                map(e=>({fn:e,log_size:f[e].log.length,code:null,data:JSON.parse(f[e].data)})).
                filter(e=>algo(e.data.code)).
                map(e=>mapaddfront({code:e.data.code,data:data_filter(e.data.data)},e)).
                map(e=>({cmd:"http://vm-vm.1d35.starter-us-east-1.openshiftapps.com/del?fn="+e.fn})).
                map(e=>xhr_get(e.cmd,none,none)+"  "+e.cmd).join("\n") //*/
            );
          }
          if('all' in qp)data_filter=e=>e;
          return jstable(
            mapkeys(f).filter(e=>e.includes("eval/")).reverse().map(e=>({fn:e,log_size:f[e].log.length,code:null,data:JSON.parse(f[e].data)})).
              map(e=>mapaddfront({code:e.data.code,data:data_filter(e.data.data)},e))
          );
        }
        if("/hops"==uri){
          return jstable(g_obj['g_obj.json'].map(e=>e).reverse());
        }
        if("/logs"==uri){
          var m=getmap(g_obj,'logs');
          var func=e=>txt(inspect(e));
          if('json' in qp)func=e=>txt(json(e));
          if('all' in qp)return func(m);
          var func=jstable;
          if('json' in qp)func=e=>txt(json(e));
          var arr=m['hostname' in qp?qp.hostname:os.hostname()];
          return func(arr);
        }
        var links2table=arr=>{
          var head=("<html><style>table{border-spacing:64px 0;font-size:1.17em;font-weight:bold;}div{"+
            "position:absolute;top:5%;left:50%;transform:translate(-50%,0%);"+
            "}</style><body><div>"
          );
          var as_table=arr=>'<table>'+(arr.map(e=>'<tr><td><a href="'+e+'">'+e+'</a></td></tr>').join("\n"))+"</table>";
          return head+as_table(arr);
        }
        if("/sitemap"==uri){
          var hide="close,exit,inc,dec,del,put,get,internal,eval,tick,ping".split(",");
          var preproc=s=>s.split('+"/').join("*cut*");
          return html(links2table(
            qap_unique(
              preproc(fs.readFileSync("main.js")+"").split('"'+'/').map(e=>e.split('"')[0]).slice(1).filter(e=>e.length)
            ).filter(e=>hide.indexOf(e)<0).map(e=>'/'+e))
          );
        }
        if("/hostname"==uri){return txt(os.hostname());}
        if("/fetch"==uri){
          (()=>{
            var repo="https://raw.githubusercontent.com/opseed/node_with_gcc/master/";
            if('git' in qp)
            {
              var run=cmd=>execSync(cmd)+"";
              var f=cmd=>run(cmd).split("\n").map(e=>e.substr("vm/".length)).filter(e=>e.length);
              var out=[
                run(`rm -rf vm`),
                run(`git clone https://github.com/opseed/node_with_gcc.git`),
                f("find vm/* -type d").map(e=>"mkdir -p "+e).map(run).join("\n"),
                f("find vm/* -type f").map(e=>"cp vm/"+e+" "+e).map(run).join("\n"),
                run(`rm -rf vm`),
                execSync("ls -lh"),
                ""
              ];
              if('quit' in qp)raw_quit();
              return out.join("\n\n");
            }
            var fn=('fn' in qp)?qp.fn:"main.js";
            xhr_get(repo+fn+'?t='+rand(),s=>{
              fs.writeFileSync(fn,s);
              txt("["+getDateTime()+"] fetch done //length = "+Buffer.byteLength(s));
              if('quit' in qp)raw_quit();
            },txt);
          })();
          return;
        }
        if("/rollback"==uri){fs.unlinkSync("fast_unsafe_auto_restart_enabled.txt");quit();}
        if("/close"==uri||"/quit"==uri||"/exit"==uri)quit();
        if("/"==uri)return txt("count = "+inc(g_obj,'counter'));
        if("/tick"==uri){g_ping_base=get_tick_count();return txt("tick = "+inc(g_obj,'tick'));}
        if("/ping"==uri){g_ping_base=get_tick_count();return txt(getDateTime());}
        var eval_impl=()=>{
          var eval_impl_response=response;
          try{
            var system_tmp=eval("()=>{"+POST['code']+"\n;return '';}");
            system_tmp=system_tmp();
            if(response){
              response.writeHead(200,{"Content-Type": "text/plain"});
              response.end(system_tmp);
              return;
            }
          }catch(err){
            eval_impl_response.writeHead(500,{"Content-Type":"text/plain"});
            eval_impl_response.end(qap_err(uri+'.code',err));
            return;
          }
        };
        if("/eval"==uri){
          if('nolog' in qp)return eval_impl();
          var rnd=rand()+"";rnd="00000".substr(rnd.length)+rnd;
          var rec="http://"+master+'/put?fn=eval/rec['+getDateTime()+"]"+rnd+"_"+os.hostname()+".json";
          xhr_post(rec,{data:json({code:qp.code,data:qp.data})},eval_impl,err=>txt('rec_error:\n'+err));
          return;
        }
        if("/crudes"==uri){
          return fs.readdir('./crude',(err,arr)=>html(links2table(arr.map(e=>'/c/'+e))));
        }
        if("/intervals"==uri){
          return ('json' in qp?inspect:jstable)(g_intervals.map(e=>{return {data:e.data,ms:e.ref['_idleTimeout'],func:e.func+''}}));
        }
        if(uri.slice(0,3)=='/c/'){
          var fn="./crude/"+uri.slice(3);
          fs.stat(fn,(err,stat)=>{
            if(err){throw err;}
            POST.code='';
            fs.createReadStream(fn).on('data',s=>POST.code+=s).on('end',eval_impl);
          });
          return;
        }
        if(uri=='/pagecount')return txt('ok');
        if(!exists){
          response.writeHead(404, {"Content-Type": "text/plain"});
          response.end("404 Not Found\n");
          return;
        }
        fs.stat(filename,(error,stat)=>{
          if(error){throw error;}
          var arr=contentTypesByExtension;
          var ext=path.extname(filename);
          var ct=ext in arr?arr[ext]:'application/octet-stream';
          response.writeHead(200,{
            'Content-Type':ct,
            'Content-Length':stat.size
          })
          fs.createReadStream(filename).pipe(response).on('end',()=>{response.destroy();request.destroy()});
        });
      };
      req_handler();
    });
  });
}
qap_log("Static file server running at http://localhost:"+port);
qap_log("CTRL + C to shutdown");
