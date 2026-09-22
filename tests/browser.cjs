const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {spawn} = require('node:child_process');
const assert = require('node:assert/strict');
const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tip-days-test-')); console.log('Evidence:', out);
const stage = process.argv[2] || 'before';
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(r=>setTimeout(r,ms));
let child, socket, server;
(async()=>{
 server=http.createServer((req,res)=>{
  const file=({'/':'index.html','/index.html':'index.html','/distribution.js':'distribution.js','/script.js':'script.js','/style.css':'style.css'})[req.url];
  if(!file){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,file)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=path.join(out,'chrome-'+stage+'-'+Date.now());
 child=spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);
 let port;
 for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await pause(100);}
 if(!port)throw Error('Chrome failed: '+stderr.slice(-2000));
 const targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let id=0;const pending=new Map();const errors=[],networkErrors=[],downloads=[];
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Network.loadingFailed')networkErrors.push(m.params.errorText);else if(m.method==='Browser.downloadWillBegin')downloads.push(m.params.suggestedFilename);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const until=async exp=>{for(let i=0;i<120;i++){try{if(await evaluate(exp))return;}catch{}await pause(100);}throw Error('Timeout: '+exp);};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
 await until('document.querySelector(".app").classList.contains("visible")');
 await pause(900);
 const checks = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS', name); };
 const click = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
 const input = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const basic = async amount => { await click('#period-selector'); await click('[data-month="0"]'); await input('#tips', amount); await click('.continue-button'); };
 check('catalog IDs unique', await evaluate('new Set(employees.map(e=>e.id)).size'), 63);
 await click('.continue-button');
 check('empty form blocked', await evaluate('location.hash'), '#calculation');
 await basic('100');
 await click('.continue-employees-button');
 check('empty selection blocked', await evaluate('employeeError.textContent'), 'Select at least one employee.');
 // Native keyboard interaction: select with Space, then Tab into the days input.
 await evaluate('document.querySelector("#employee-1").focus()');
 await send('Input.dispatchKeyEvent', {type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await send('Input.dispatchKeyEvent', {type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 check('keyboard reaches associated days field', await evaluate('document.activeElement.id'), 'days-1');
 await send('Input.insertText', {text:'20'});
 await click('#employee-2'); await input('#days-2', '10');
 await click('#employee-1');
 check('F: deselected days removed', await evaluate('selectedEmployees.map(e=>[e.id,e.daysWorked])'), [[2,'10']]);
 await click('.continue-employees-button'); await click('.calculate-button'); await until('location.hash==="#result"');
 check('F: remaining employee receives all tips', await evaluate('calculationResult.payments.map(e=>e.amountCents)'), [10000]);
 await evaluate('history.back()'); await until('location.hash==="#review"');
 await evaluate('history.back()'); await until('location.hash==="#employees"');
 await click('#employee-1');
 check('reselect starts with blank days', await evaluate('document.querySelector("#days-1").value'), '');
 for (const invalid of ['', '-1', '1.5', '1e2', 'Infinity']) {
   await input('#days-1', invalid); await click('.continue-employees-button');
   check('invalid days blocked: '+invalid, await evaluate('location.hash'), '#employees');
 }
 await input('#days-1','0'); await input('#days-2','0'); await click('.continue-employees-button');
 check('E: zero total days blocked',await evaluate('employeeError.textContent'),'Total worked days must be greater than zero.');
 await input('#days-1','20'); await input('#days-2','10');
 await evaluate('[...outletList.querySelectorAll("button")].find(b=>b.textContent==="Wine Bar 1638").click();selectAllButton.click();selectAllButton.click();allOutletsButton.click()');
 check('filters and select all preserve other days',await evaluate('selectedEmployees.map(e=>[e.id,e.daysWorked]).sort((a,b)=>a[0]-b[0])'),[[1,'20'],[2,'10']]);
 await click('.continue-employees-button');
 check('review days', await evaluate('document.querySelector("#review-days").textContent'), '30');
 await click('.calculate-button'); await until('location.hash==="#result"');
 check('B: browser result',await evaluate('calculationResult.payments.map(e=>[e.id,e.amountCents]).sort((a,b)=>a[0]-b[0])'),[[1,6667],[2,3333]]);
 check('daily rate is display only',await evaluate('[resultAmount.textContent,document.querySelector("#result-total").textContent]'),['€ 3.33','€ 100.00']);
 await evaluate('history.back()'); await until('location.hash==="#review"');
 await evaluate('history.back()'); await until('location.hash==="#employees"');
 await input('#days-1','10');
 await evaluate('history.forward()'); await until('location.hash==="#review"');
 check('forward refreshes review',await evaluate('document.querySelector("#review-days").textContent'),'20');
 await evaluate('history.forward()'); await pause(200);
 check('forward cannot resurrect old result',await evaluate('[location.hash,calculationResult]'),['#review',null]);
 await click('.calculate-button');
 await evaluate('history.back()'); await pause(3400);
 check('back cancels calculation timer',await evaluate('[calculatingInterval,calculationResult,document.querySelector(".result-screen").classList.contains("visible")]'),[null,null,false]);
 await evaluate('goToReviewCalculation()'); await click('.calculate-button'); await until('location.hash==="#result"');
 check('A: corrected equal days',await evaluate('calculationResult.payments.map(e=>e.amountCents)'),[5000,5000]);
 await click('.new-calculation-button');
 check('reset clears model and rendered results',await evaluate('[selectedEmployees.length,calculationResult,tipsInput.value,document.querySelector("#result-employee-list").children.length,resultAmount.textContent,selectedCount.textContent]'),[0,null,'',0,'—','0 SELECTED']);
 await evaluate('history.back()'); await pause(200);
 check('reset blocks previous session routes',await evaluate('location.hash'),'#calculation');
 await basic('€1.234,56');
 await evaluate('selectAllButton.click()');
 await evaluate('document.querySelectorAll(".days-input").forEach((el,i)=>{el.value=String(i%31);el.dispatchEvent(new Event("input",{bubbles:true}))})');
 await click('.continue-employees-button'); await click('.calculate-button'); await until('location.hash==="#result"');
 check('all 63 payouts conserve cents',await evaluate('[calculationResult.employeeCount,calculationResult.totalDistributedCents,calculationResult.payments.reduce((s,e)=>s+e.amountCents,0)]'),[63,123456,123456]);
 // Real jsPDF: record text and bytes while retaining actual save/download behavior.
 await until('Boolean(window.jspdf?.jsPDF)');
 await evaluate(`window.__OriginalPDF=window.jspdf.jsPDF;window.jspdf.jsPDF=new Proxy(window.__OriginalPDF,{construct(target,args){const pdf=new target(...args);const text=pdf.text;window.__pdfText=[];pdf.text=function(value,...rest){window.__pdfText.push(value);return text.call(this,value,...rest)};const save=pdf.save;pdf.save=function(name){window.__pdfName=name;window.__pdfData=btoa(pdf.output());window.__pdfPages=pdf.getNumberOfPages();return save.call(this,name)};return pdf}})`);
 await click('.download-pdf-button');
 const pdf = await evaluate('({name:__pdfName,data:__pdfData,pages:__pdfPages,text:__pdfText,expected:calculationResult.payments})');
 fs.writeFileSync(path.join(out,pdf.name),Buffer.from(pdf.data,'base64'));
 assert.ok(pdf.pages>1,'PDF pagination');
 const pdfStrings = pdf.text.flat();
 for(const row of pdf.expected) assert.ok(pdfStrings.includes(row.name),'PDF includes '+row.name);
 check('PDF exact total',pdfStrings.includes('TOTAL DISTRIBUTED: € 1,234.56'),true);
 check('PDF downloaded',downloads.includes(pdf.name),true);
 console.log('PDF pages:',pdf.pages);
 await evaluate('window.jspdf=undefined'); await click('.download-pdf-button');
 check('PDF unavailable has user feedback',await evaluate('document.querySelector("#pdf-error").textContent.startsWith("Unable")'),true);
 const metrics=[];
 for(const width of [320,375,768,1024,1440]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
   for(const screen of ['employees','review','result']) {
     await evaluate('showScreen('+JSON.stringify(screen)+')');await pause(850);
     if (screen === 'employees') {
       assert.ok(await evaluate('Array.from(document.querySelectorAll(".employee.selected .days-input")).every(input => {const rect=input.getBoundingClientRect();const row=input.closest(".employee").getBoundingClientRect();return rect.height>=44 && rect.bottom<=row.bottom && rect.right<=row.right})'), 'Days inputs fully visible within rows at '+width);
     }
     const metric=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth})');
     assert.ok(metric.scrollWidth<=metric.width,'horizontal overflow '+width+' '+screen);metrics.push({width,screen,...metric});
     if(width===320||width===1440) {
       const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
       fs.writeFileSync(path.join(out,width+'-'+screen+'.png'),Buffer.from(shot.data,'base64'));
     }
   }
 }
 check('responsive layouts without horizontal overflow',metrics.length,15);
 await send('Page.reload');await until('document.querySelector(".app").classList.contains("visible")');
 check('reload starts empty',await evaluate('[location.hash,selectedEmployees.length,calculationResult,tipsInput.value]'),['#calculation',0,null,'']);
 check('no runtime exceptions',errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,metrics,errors,networkErrors,pdf:{name:pdf.name,pages:pdf.pages}},null,2));
 console.log(JSON.stringify({passed:checks.length,out,networkErrors},null,2));
 await send('Browser.close');socket.close();server.close();
})().catch(e=>{console.error(e);socket?.close();child?.kill();server?.close();process.exitCode=1;});
