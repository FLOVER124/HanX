const fs=require('node:fs/promises');
async function importSlideImage(session,index,filename,nativeImage){
 const current=await session.read();if(current.kind!=='presentation'||!Number.isInteger(index)||!current.model.slides[index])throw Error('슬라이드를 선택하세요.');
 const stat=await fs.stat(filename);if(!stat.isFile()||stat.size>16*1024*1024)throw Error('16 MB 이하의 그림을 선택하세요.');
 const data=await fs.readFile(filename),image=nativeImage.createFromBuffer(data),size=image.getSize();
 if(image.isEmpty()||size.width<1||size.height<1||size.width*size.height>16000000)throw Error('1,600만 화소 이하의 PNG 또는 JPEG 그림을 선택하세요.');
 const png=image.toPNG();if(png.length>16*1024*1024)throw Error('변환한 그림이 16 MB를 초과합니다.');
 const scale=Math.min(1,current.model.width*.6/size.width,current.model.height*.6/size.height),width=size.width*scale,height=size.height*scale;
 return session.edit([{op:'add_shape',slide:index,value:{kind:'image',name:'그림',x:(current.model.width-width)/2,y:(current.model.height-height)/2,width,height,lockAspect:true,imageData:{name:'image.png',data:png.toString('base64')}}}]);
}
module.exports={importSlideImage};
