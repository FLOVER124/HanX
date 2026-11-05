'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {runEngine}=require('./engine.cjs');
class PDFSession {
 constructor(executable,source){this.executable=executable;this.source=source;this.history=[];this.future=[];this.savedCopy=false;}
 async init(){this.directory=await fs.mkdtemp(path.join(os.tmpdir(),'hanx-pdf-'));this.current=path.join(this.directory,'original.pdf');try{await fs.copyFile(this.source,this.current);}catch(e){await this.close();throw e;}this.saved=this.current;return this;}
 get dirty(){return this.saved!==this.current;}
 async page(index=0){if(!Number.isInteger(index)||index<0)throw Error('Invalid PDF page.');const data=await runEngine(this.executable,['pdf','inspect',this.current,'--page',String(index)]);const image=await runEngine(this.executable,['pdf','render',this.current,'--page',String(index)]);return {...data,image:image.image,name:path.basename(this.source),dirty:this.dirty,canUndo:!!this.history.length,canRedo:!!this.future.length};}
 async edit(args){if(!Array.isArray(args.operations)||!args.operations.length||args.operations.length>1000)throw Error('Invalid PDF operations.');const target=path.join(this.directory,randomUUID()+'.pdf');const command=['pdf','edit',this.current,'--ops','-','--output',target];if(typeof args.revision==='string')command.push('--revision',args.revision);await runEngine(this.executable,command,args.operations);this.history.push(this.current);this.future=[];this.current=target;return true;}
 undo(redo=false){const from=redo?this.future:this.history,to=redo?this.history:this.future;if(from.length){to.push(this.current);this.current=from.pop();}return true;}
 async save(destination){if(path.extname(destination).toLowerCase()!=='.pdf')throw Error('PDF 형식으로 저장하세요.');const temp=path.join(path.dirname(destination),'.hanx-pdf-'+randomUUID()+'.pdf');try{await fs.copyFile(this.current,temp);await fs.rename(temp,destination);}finally{await fs.rm(temp,{force:true});}this.source=destination;this.saved=this.current;this.savedCopy=true;return true;}
 async ocr(args){if(!Number.isInteger(args.page)||typeof args.language!=='string')throw Error('Invalid OCR request.');return runEngine(this.executable,['pdf','ocr',this.current,'--page',String(args.page),'--language',args.language]);}
 async close(){if(this.directory)await fs.rm(this.directory,{recursive:true,force:true});}
}
module.exports={PDFSession};
