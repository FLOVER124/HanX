// Shape coordinates use slide points, just like SlideRenderer.path on macOS.
(function (root) {
  const titles = {
    text:'텍스트 상자', rect:'사각형', roundRect:'둥근 사각형', ellipse:'타원', triangle:'삼각형',
    rightArrow:'오른쪽 화살표', line:'선', image:'그림', table:'표', diamond:'마름모',
    pentagon:'오각형', hexagon:'육각형', octagon:'팔각형', star5:'별 (5각)', star6:'별 (6각)',
    heart:'하트', plus:'십자', leftArrow:'왼쪽 화살표', upArrow:'위쪽 화살표', downArrow:'아래쪽 화살표',
    leftRightArrow:'양쪽 화살표', chevron:'갈매기형', parallelogram:'평행사변형', trapezoid:'사다리꼴'
  };
  const polygons = {
    triangle:[[.5,0],[1,1],[0,1]],
    parallelogram:[[.2,0],[1,0],[.8,1],[0,1]],
    trapezoid:[[.2,0],[.8,0],[1,1],[0,1]],
    chevron:[[0,0],[.65,0],[1,.5],[.65,1],[0,1],[.35,.5]],
    plus:[[.35,0],[.65,0],[.65,.35],[1,.35],[1,.65],[.65,.65],[.65,1],[.35,1],[.35,.65],[0,.65],[0,.35],[.35,.35]],
    leftRightArrow:[[0,.5],[.25,0],[.25,.3],[.75,.3],[.75,0],[1,.5],[.75,1],[.75,.7],[.25,.7],[.25,1]]
  };
  const vertices = {diamond:4,pentagon:5,hexagon:6,octagon:8,star5:10,star6:12};
  function geometry(kind,w,h) {
    const polygon = points => ['polygon',{points:points.map(([x,y])=>[x*w,y*h].join(',')).join(' ')}];
    if (polygons[kind]) return polygon(polygons[kind]);
    if (vertices[kind]) {
      const count=vertices[kind];
      return polygon(Array.from({length:count},(_,i)=>{
        const angle=i*2*Math.PI/count-Math.PI/2;
        const radius=kind.startsWith('star') && i%2 ? .215 : .5;
        return [.5+radius*Math.cos(angle),.5+radius*Math.sin(angle)];
      }));
    }
    switch(kind) {
      case 'image': case 'table': return null;
      case 'roundRect': return ['rect',{width:w,height:h,rx:.16*Math.min(w,h)}];
      case 'ellipse': return ['ellipse',{cx:w/2,cy:h/2,rx:w/2,ry:h/2}];
      case 'line': return ['line',{x1:0,y1:0,x2:w,y2:h}];
      case 'heart': return ['path',{d:`M ${.5*w} ${h} C ${-.5*w} ${.35*h} ${.05*w} ${-.35*h} ${.5*w} ${.18*h} C ${.95*w} ${-.35*h} ${1.5*w} ${.35*h} ${.5*w} ${h} Z`}];
      case 'leftArrow': case 'rightArrow': case 'upArrow': case 'downArrow': {
        const vertical=kind==='upArrow'||kind==='downArrow';
        const length=vertical?h:w, thickness=vertical?w:h;
        const neck=1-Math.min(length*.4,thickness)/(length||1);
        return polygon([[0,.25],[neck,.25],[neck,0],[1,.5],[neck,1],[neck,.75],[0,.75]].map(([x,y])=>{
          if(kind==='upArrow') return [y,1-x];
          if(kind==='downArrow') return [1-y,x];
          if(kind==='leftArrow') return [1-x,1-y];
          return [x,y];
        }));
      }
      default: return ['rect',{width:w,height:h}];
    }
  }
  function svgElement(tag,attributes) {
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
    return node;
  }
  function graphic(shape,color) {
    const {w,h}=shape.frame, spec=geometry(shape.kind,w,h);
    if(!spec) return null;
    const svg=svgElement('svg',{class:'shape-graphic',viewBox:`0 0 ${w||1} ${h||1}`,preserveAspectRatio:'none','aria-hidden':'true'});
    svg.append(svgElement(spec[0],{...spec[1],fill:shape.kind==='line'?'none':color(shape.fill,'none'),stroke:color(shape.line,'none'),'stroke-width':shape.lineWidth??.75}));
    return svg;
  }
  function insertion(kind,model) {
    const line=kind==='line',text=kind==='text';
    const width=line?300:text?400:240,height=line ? 0.01 : text ? 80 : 160;
    const box={kind,name:titles[kind],x:(model.width-width)/2,y:line?model.height/2:(model.height-height)/2,width,height};
    if(line) return {...box,line:'000000',lineWidth:2};
    if(text) return {...box,text:'',style:{size:24}};
    return {...box,fill:'4472C4',line:'2F528F',text:'',alignment:'center',style:{size:18,color:'FFFFFF'}};
  }
  const api={titles,geometry,graphic,insertion};
  if(typeof module!=='undefined') module.exports=api;
  else root.HanXShapes=api;
})(globalThis);
