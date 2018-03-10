var child_process=require('child_process');
var fs=require('fs');
var execSync=child_process.execSync;
var qs = require('querystring');
var http = require("http"),
    https = require("https"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    os = require("os"),
crypto = require('crypto');

var call_cb_on_err=(emitter,cb,...args)=>{
  emitter.on('error',err=>{
    cb("'inspect({args,err}) // stack': "+inspect({args:args,err:err})+" // "+err.stack.toString());
  });
}

var qap_log=s=>console.log("["+getDateTime()+"] "+s);

var qap_err=(context,err)=>context+" :: err = "+inspect(err)+" //"+err.stack.toString();
var log_err=(context,err)=>qap_log(qap_err(context,err));

process.on('uncaughtException',err=>log_err('uncaughtException',err));

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

var file_exist=fn=>{try{fs.accessSync(fn);return true;}catch(e){return false;}}
var rand=()=>(Math.random()*1024*64|0);

var ee_logger_v2=(emitter,name,cb,events)=>{
  events.split(',').map(event=>emitter.on(event,e=>cb(name+' :: Got '+event)));
  call_cb_on_err(emitter,cb,name);
}

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

var dns2h={
  "vm-vm.1d35.starter-us-east-1.openshiftapps.com":"us",
  "agile-eyrie-44522.herokuapp.com":"ae",
  "vm-vm.193b.starter-ca-central-1.openshiftapps.com":"ca",
  "vm50.herokuapp.com":"vm50",
  "vm51.herokuapp.com":"vm51",
  "vm52.herokuapp.com":"vm52",
  "vm10-vm10.1d35.starter-us-east-1.openshiftapps.com":"vm10",
  "vm20-vm20.1d35.starter-us-east-1.openshiftapps.com":"vm20",
  "vm30-vm30.193b.starter-ca-central-1.openshiftapps.com":"vm30"
};
var h2dns={};for(var dns in dns2h){h2dns[dns2h[dns]]=dns;}

var ps1=(()=>{
  //COLUMNS=180;
  //STARTCOLOR='\e[0;32m';
  //ENDCOLOR="\e[0m"
  //export PS1="$STARTCOLOR[\$(date +%k:%M:%S)] \w |\$?> $ENDCOLOR"
  //export TERM='xterm'
  //alias rollback='pkill -f npm'
  //alias cls='clear'
  //alias ll='ls -alh --color=always'
  //alias grep='grep --color=always'
  //LS_COLORS=$LS_COLORS:'di=0;33:' ; export LS_COLORS
  //ps -aux
}).toString().split("\n").slice(1,-1).join("\n").split("  //").join("");


var press_insert_key=String.fromCharCode(27,91,50,126);

var xhr_blob_upload=(method,URL,ok,err,fn)=>{
  if(typeof(fn)=='undefined')fn="mask_basepix_log.txt";
  var fromR=(z,msg)=>{if(z in z2func)z2func[z](msg);};
  var z2func={
    out:msg=>process.stdout.write(msg),
    err:msg=>process.stderr.write(msg),
    qap_log:msg=>qap_log("formR :: "+msg),
    exit:msg=>process.exit()
  };
  var req=qap_http_request_decoder(method,URL,fromR,()=>{process.exit();});
  
  var toR=z=>stream_write_encoder(req,z);
  toR("eval")(
    (()=>{
      var q=a=>toR("qap_log")("["+getDateTime()+"] :: "+a);
      var stream=false;var off=s=>{if(!s)return;s.destroy();}
      Object.assign(z2func,{
        fn:(msg,buf)=>{off(stream);stream=fs.createWriteStream(msg);q("fn = "+msg);},
        data:(msg,buf)=>{stream.write(buf);q(msg.length);},
        end:msg=>{q("done!");on_exit();}
      });
      q("begin");
      on_exit_funcs.push(()=>off(stream));
    }).toString().split("\n").slice(1,-1).join("\n")
  );
  var f=fn=>{
    toR("fn")(fn);
    fs.createReadStream("../../Release/"+fn).on('data',toR("data")).on('end',()=>{toR("end")();});
  }
  f(fn);
  var ping=toR("ping");var iter=0;setInterval(()=>ping(""+(iter++)),500);
  return req;
}

var qap_http_request_decoder=(method,URL,fromR,on_end)=>{
  var up=url.parse(URL);var secure=up.protocol=='https';
  var options={
    hostname:up.hostname,port:up.port?up.port:(secure?443:80),path:up.path,method:method.toUpperCase(),
    headers:{'qap_type':'rt_sh','Transfer-Encoding':'chunked'}
  };
  var req=(secure?https:http).request(options,(res)=>
  {
    var statusCode=res.statusCode;
    if(res.statusCode!==200){qap_log('Request Failed.\nStatus Code: '+res.statusCode);res.destroy();req.destroy();return;}
    ee_logger_v2(res,'qhrd.res',qap_log,'end,abort,aborted,connect,continue,response,upgrade');
    emitter_on_data_decoder(res,fromR);
    res.on('end',on_end);
  });
  ee_logger_v2(req,'qhrd.req',qap_log,'end,abort,aborted,connect,continue,response,upgrade');
  req.setNoDelay();
  return req;
};

var xhr_shell=(method,URL,ok,err)=>{
  var fromR=(z,msg)=>{/*qap_log("\n"+json({z:z,msg:msg}));*/if(z in z2func)z2func[z](msg);};
  var z2func={
    out:msg=>process.stdout.write(msg),
    err:msg=>process.stderr.write(msg),
    qap_log:msg=>qap_log("formR :: "+msg),
    exit:msg=>process.exit()
  };
  var req=qap_http_request_decoder(method,URL,fromR,()=>process.exit());
  var toR=z=>stream_write_encoder(req,z);
  toR("eval")(
    (()=>{
      var q=a=>toR("qap_log")("["+getDateTime()+"] :: "+a);
      var sh=spawn('bash',['-i'],{detached:true});on_exit_funcs.push(()=>sh.kill('SIGHUP'));
      var finish=msg=>{
        q(msg);
        toR("exit")();
        on_exit();
      }
      sh.stderr.on("data",toR("err")).on('end',()=>q("end of bash stderr"));
      sh.stdout.on("data",toR("out")).on('end',()=>q("end of bash stdout"));
      sh.on('close',code=>finish("bash exited with code "+code));
      call_cb_on_err(sh,qap_log,'sh');
      z2func['inp']=msg=>sh.stdin.write(msg);
      on_exit_funcs.push(()=>{delete z2func['inp'];});
      q("begin");
    }).toString().split("\n").slice(1,-1).join("\n")
  );
  var inp=toR("inp");
  var ping=toR("ping");var iter=0;setInterval(()=>ping(""+(iter++)),500);
  var set_raw_mode=s=>{if('setRawMode' in s)s.setRawMode(true);}
  set_raw_mode(process.stdin);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',data=>{if(data==='\u0003')process.exit();inp(data);});
  inp(press_insert_key);
  inp(ps1+"\n");
  inp("echo xhr_shell URL = "+json(URL)+"\n");
  inp("echo welcome\n");
  process.stdin.resume();
  return req;
}

var json=JSON.stringify;

var xhr=(method,URL,data,ok,err)=>{
  if((typeof ok)!="function")ok=()=>{};
  if((typeof err)!="function")err=()=>{};
  var up=url.parse(URL);var secure=up.protocol=='https';
  var options={
    hostname:up.hostname,port:up.port?up.port:(secure?443:80),path:up.path,method:method.toUpperCase(),
    headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(data)}
  };
  var req=(secure?https:http).request(options,(res)=>{
    if(res.statusCode!==200){err('Request Failed.\nStatus Code: '+res.statusCode);res.destroy();req.destroy();return;}
    //res.setEncoding('utf8');
    var rawData='';res.on('data',(chunk)=>rawData+=chunk.toString("binary"));
    res.on('end',()=>{try{ok(rawData,res);}catch(e){err(e.message,res);}});
  });
  call_cb_on_err(req,qap_log,'xhr');
  req.end(data);
  return req;
}

var xhr_add_timeout=(req,ms)=>req.on('socket',sock=>sock.on('timeout',()=>req.abort()).setTimeout(ms));

var xhr_post=(url,obj,ok,err)=>xhr('post',url,qs.stringify(obj),ok,err);
var xhr_post_with_to=(url,obj,ok,err,ms)=>xhr_add_timeout(xhr('post',url,qs.stringify(obj),ok,err),ms);

  
  
var xhr_shell_writer=(method,URL,ok,err,link_id)=>{
  var fromR=(z,msg)=>{}
  var req=qap_http_request_decoder(method,URL,fromR,()=>{qap_log("writer end");process.exit();});
  var toR=z=>stream_write_encoder(req,z);
  toR("eval")(
    "var link_id="+json(link_id)+";"+
    (()=>{
      var sh=spawn('bash',['-i'],{detached:true});on_exit_funcs.push(()=>sh.kill('SIGHUP'));
      call_cb_on_err(sh,qap_log,'sh');
      z2func.inp=msg=>sh.stdin.write(msg);
      on_exit_funcs.push(()=>{delete z2func['inp'];});
      var link=getmap(g_links,link_id);
      link.sh=sh;
      link.on_up(sh,on_exit);
      on_exit_funcs.push(()=>{delete g_links[msg];});
    }).toString().split("\n").slice(1,-1).join("\n")
  );
  var inp=toR("inp");
  var ping=toR("ping");var iter=0;setInterval(()=>ping(""+(iter++)),500);
  var set_raw_mode=s=>{if('setRawMode' in s)s.setRawMode(true);}
  set_raw_mode(process.stdin);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',data=>{if(data==='\u0003')process.exit();inp(data);});

  inp(press_insert_key);
  inp(ps1+"\n");
  inp("echo xhr_shell URL = "+json(URL)+"\n");
  inp("echo welcome\n");
  process.stdin.resume();
  return req;
}

var xhr_shell_reader=(method,URL,ok,err,link_id)=>{
  var fromR=(z,msg)=>{/*qap_log("\n"+json({z:z,msg:msg}));*/if(z in z2func)z2func[z](msg);};
  var z2func={
    out:msg=>process.stdout.write(msg),
    err:msg=>process.stderr.write(msg),
    qap_log:msg=>qap_log("formR :: "+msg),
    exit:msg=>process.exit(),
    ok:msg=>ok(msg)
  };
  var req=qap_http_request_decoder(method,URL,fromR,()=>{qap_log("wtf? reader end?");process.exit();});
  var toR=z=>stream_write_encoder(req,z);
  toR("eval")(
    "var link_id="+json(link_id)+";"+
    (()=>{
      var q=a=>toR("qap_log")("["+getDateTime()+"] :: "+a);
      var finish=msg=>{
        q(msg);
        toR("exit")();
        on_exit();
      }
      getmap(g_links,link_id).on_up=(sh,onexit)=>{
        on_exit_funcs.push(onexit);
        sh.stderr.on("data",toR("err")).on('end',()=>q("end of bash stderr"));
        sh.stdout.on("data",toR("out")).on('end',()=>q("end of bash stdout"));
        sh.on('close',code=>finish("bash exited with code "+code));
      }
      q("begin");
      toR("ok")();
    }).toString().split("\n").slice(1,-1).join("\n")
  );
  req.end();
  return req;
}
var fn="mask_basepix_log.txt";
var api="duplex";var host=h2dns["ae"];
var with_protocol=host=>{
  var a=['http://','https://'];
  var out=host;
  var tmp=a.map(p=>host.substr(0,p.length)===p).filter(e=>e);
  if(!tmp.length)return a[0]+host;
  return host;
}; 
var f=(key,val)=>{
  if(key==="api"){api=val;}
  if(key==="fn"){fn=val;}
  if(key==="host"){if(val in h2dns){host="http://"+h2dns[val];}else{host=with_protocol(val);}}
};
process.argv.map(e=>{var t=e.split("=");if(t.length!=2)return;f(t[0],t[1]);});

if(api=="inspect")qap_log(inspect(process.argv));
if(api=="shell")xhr_shell("post",host+"/rt_sh",qap_log,qap_log);
if(api=="upload")xhr_blob_upload("post",host+"/rt_sh",qap_log,qap_log,fn);
if(api=="duplex"||api=="dup"){
  var with_link_id=link_id=>{
    var ok=s=>{
      xhr_shell_writer("post",host+"/rt_sh",qap_log,qap_log,link_id);
    }
    xhr_shell_reader("post",host+"/rt_sh",ok,qap_log,link_id);
  }

  var code=`return new_link().id;`;
  xhr_post(host+"/eval?nolog",{code:code},with_link_id,s=>qap_log("xhr_evalno_log fails: "+s));
}