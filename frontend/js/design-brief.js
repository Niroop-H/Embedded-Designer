/* Requirement capture only: never silently equate a brief with a verified board. */
(function(root) {
  'use strict';
  const steps = [
    {title:'Application & environment', hint:'Describe the device, maximum board size, and operating environment.', fields:[['application','What should the device do?'],['footprint','Maximum width × height (mm)'],['environment','Environment and temperature range']]},
    {title:'Power & load budget', hint:'Capture continuous and peak loads separately. Use “unknown” if measurement is needed.', fields:[['source','Power source and input voltage range'],['continuous','Continuous current (mA)'],['peak','Absolute peak current (mA)'],['runtime','Target runtime (or wall-powered)']]},
    {title:'Core processor', hint:'Choose an exact part or request a recommendation. The recommendation still needs review.', fields:[['mcu','Exact MCU / module, or Let AI Decide'],['compute','Computation, memory, I/O count and wireless needs']]},
    {title:'Peripherals & interfaces', hint:'Include protocols, quantities and external connectors.', fields:[['peripherals','Sensors, actuators and peripherals'],['interfaces','I2C / SPI / UART / USB / PWM and voltage requirements']]}
  ];
  function createBrief(){return {version:1,step:0,answers:{},locked:false};}
  function advance(brief, values){
    if(brief.locked) throw new Error('Unlock the brief before editing');
    const step=steps[brief.step]; if(!step) throw new Error('Review the brief before locking');
    for(const [key] of step.fields) if(!String(values[key]||'').trim()) throw new Error('Complete each field, or enter unknown.');
    return {...brief,answers:{...brief.answers,...values},step:brief.step+1};
  }
  function lock(brief){
    if(brief.step!==steps.length || steps.some(s=>s.fields.some(([key])=>!String(brief.answers[key]||'').trim()))) throw new Error('Complete all discovery steps first');
    return {...brief,locked:true,lockedAt:new Date().toISOString()};
  }
  const api={steps,createBrief,advance,lock};
  if(typeof module!=='undefined') module.exports=api;
  root.DesignBrief=api;
  if(typeof document==='undefined') return;
  document.addEventListener('DOMContentLoaded',()=>{
    const key='embedded-designer:brief:v1'; let brief=createBrief();
    try {const saved=JSON.parse(localStorage.getItem(key));if(saved?.version===1 && Number.isInteger(saved.step) && saved.step>=0 && saved.step<=4 && saved.answers && typeof saved.answers==='object') brief=saved;} catch{}
    const dialog=document.createElement('dialog'); dialog.className='brief-dialog';document.body.append(dialog);
    function persist(){try{localStorage.setItem(key,JSON.stringify(brief));return true;}catch{return false;}}
    function node(tag,text,className){const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;}
    function render(){
      dialog.replaceChildren();const head=node('div',null,'brief-head');head.append(node('span','DESIGN DISCOVERY','brief-eyebrow'));
      const close=node('button','×');close.type='button';close.setAttribute('aria-label','Close design brief');close.onclick=()=>dialog.close();head.append(close);dialog.append(head);
      dialog.append(node('h2',brief.locked?'Requirements locked':brief.step===4?'Review your design brief':steps[brief.step].title));
      dialog.append(node('p',brief.step===4?'This locks requirements only. It does not generate or validate manufacturing files.':steps[brief.step].hint));
      const progress=node('div',null,'brief-progress');steps.forEach((s,i)=>{const item=node('span',`${i+1}. ${s.title}`);if(i<=brief.step)item.className='complete';progress.append(item);});dialog.append(progress);
      const form=node('form'); const error=node('p',null,'brief-error');error.setAttribute('role','status');
      if(brief.step<4){for(const [key,label] of steps[brief.step].fields){const wrap=node('label',label);const input=node('input');input.name=key;input.required=true;input.maxLength=1000;input.value=brief.answers[key]||'';if(key==='mcu')input.placeholder='ESP32-S3-WROOM-1 or Let AI Decide';wrap.append(input);form.append(wrap);}}
      else {const dl=node('dl');for(const step of steps) for(const [key,label] of step.fields){dl.append(node('dt',label),node('dd',brief.answers[key]));}form.append(dl);}
      const actions=node('div',null,'brief-actions');
      if(brief.step>0&&!brief.locked){const back=node('button','Back');back.type='button';back.onclick=()=>{brief={...brief,step:brief.step-1};persist();render();};actions.append(back);}
      const submit=node('button',brief.locked?'Unlock & edit':brief.step===4?'Lock requirements':'Continue','brief-primary');submit.type='submit';actions.append(submit);
      if(brief.locked){const download=node('button','Export brief');download.type='button';download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(brief,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='design-brief.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);};actions.append(download);}
      form.append(error,actions);form.onsubmit=e=>{e.preventDefault();try{if(brief.locked)brief={...brief,locked:false,lockedAt:null,step:0};else if(brief.step===4)brief=lock(brief);else brief=advance(brief,Object.fromEntries(new FormData(form)));const saved=persist();render();if(!saved)dialog.append(node('p','Browser storage unavailable. Export your brief before closing.','brief-error'));}catch(err){error.textContent=err.message;}};
      dialog.append(form);dialog.append(node('p','Saved in this browser. Unknown specifications remain unresolved engineering inputs.','brief-footnote'));
    }
    document.getElementById('btn-design-brief')?.addEventListener('click',()=>{render();dialog.showModal();});
  });
})(typeof globalThis!=='undefined'?globalThis:this);
