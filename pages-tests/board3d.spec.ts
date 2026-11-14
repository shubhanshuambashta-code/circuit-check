import {test,expect} from '@playwright/test';

test('component labels identify library packages and hovering component bodies shows details',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Design review',exact:true}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();
 const model=page.locator('.native-model-stage model-viewer');
 await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 const label=page.getByRole('button',{name:'U1: Integrated circuit',exact:true});
 await expect(label).toBeVisible();
 await label.hover();
 await expect(page.getByRole('tooltip')).toContainText('SOIC-16W_7.5x10.3mm_P1.27mm');
 await expect(page.getByRole('tooltip')).toContainText('16 pads (electrical contact points)');
 await expect(page.getByRole('tooltip')).toContainText('A chip containing many tiny electronic circuits');
 await expect(page.getByRole('tooltip')).toContainText('GND — ground / electrical reference');
 await label.focus();
 await expect(page.getByRole('tooltip')).toContainText('Integrated circuit');
 await page.getByLabel('Identifiers',{exact:true}).uncheck();
 await expect(label).toHaveCount(0);
 await model.scrollIntoViewIfNeeded();
 // Find an actual surface point on the centre IC, rather than hovering its label.
 const point=await model.evaluate((el:any)=>{const r=el.getBoundingClientRect();for(let y=r.top+20;y<r.bottom-20;y+=5)for(let x=r.left+20;x<r.right-20;x+=5){const p=el.positionAndNormalFromPoint(x,y)?.position;const target=document.elementFromPoint(x,y);if(!target||(!el.contains(target)&&target!==el)||target.closest('button'))continue;if(p&&Math.abs(p.x)<3&&p.z< -2&&p.z> -6&&p.y>1)return {x,y}}return null});
 expect(point).not.toBeNull();
 await page.mouse.move(point!.x,point!.y);
 await expect(page.getByRole('tooltip')).toContainText('U1');
 await expect(page.getByRole('tooltip')).toContainText('Connections (nets):');
 await page.getByLabel('Identifiers',{exact:true}).check();
 await page.getByRole('button',{name:'R1: Resistor',exact:true}).hover();
 await expect(page.getByRole('tooltip')).toContainText('R_1206_3216Metric');
 await expect(page.getByRole('tooltip')).toContainText('Limits electric current');
 await expect(page.getByRole('tooltip')).toContainText('3.2 × 1.6 mm');
 await page.locator('.native-model-stage').screenshot({path:'screenshots/3d-component-identifiers.png'});
});

test('3D is available on the initial revision comparison screen',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Revision comparison',exact:true}).click();
 const switcher=page.getByRole('group',{name:'Comparison design type',exact:true});
 await switcher.getByRole('button',{name:'3D',exact:true}).click();
 await expect(page.locator('.r2-comparison-boards model-viewer')).toHaveCount(2);
 await expect(page.getByText('KiCad library component models',{exact:true})).toHaveCount(2);
 const model=page.locator('.r2-comparison-boards model-viewer').last();
 await expect.poll(()=>model.evaluate((el:any)=>el.src)).toMatch(/demo\/models\/.*\.glb$/);
 await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 await expect(page.locator('.native-model-stage > [role=status]')).toHaveCount(0);
 await model.screenshot({path:'screenshots/3d-library-components.png'});
 await switcher.getByRole('button',{name:'Board',exact:true}).click();
 await expect(page.locator('.r2-comparison-boards .board-svg')).toHaveCount(2);
});

test('3D board supports orbit, presets, zoom and component visibility',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Design review',exact:true}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();
 await page.getByRole('button',{name:'Geometry preview',exact:true}).click();
 const scene=page.getByRole('group',{name:'Interactive 3D board preview'});
 await expect(scene).toBeVisible();
 const model=scene.locator('model-viewer');
 await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 await scene.screenshot({path:'screenshots/3d-component-preview.png'});
 const original=await model.evaluate((el:any)=>el.cameraOrbit);
 await scene.focus();await page.keyboard.press('ArrowRight');
 expect(await model.evaluate((el:any)=>el.cameraOrbit)).not.toBe(original);
 await page.getByRole('button',{name:'Zoom in 3D',exact:true}).click();
 await expect(page.locator('.board3d-toolbar')).toContainText('125%');
 await page.getByLabel('Components',{exact:true}).uncheck();
 await expect(scene).toHaveAttribute('data-components','hidden');
 await page.getByRole('button',{name:'Bottom',exact:true}).click();
 await page.getByRole('button',{name:'Reset view',exact:true}).click();
 await expect(page.locator('.board3d-toolbar')).toContainText('100%');
 await page.setViewportSize({width:390,height:900});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.getByRole('button',{name:'Board',exact:true}).click();
 await expect(page.locator('.r2-board .board-svg')).toBeVisible();
});

test('native GLB opens with camera controls and invalid files retain the current view',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'Design review',exact:true}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();
 // A small self-contained mesh verifies the binary loader without third-party assets.
 const positions=Buffer.alloc(36);[0,0,0,1,0,0,0,1,0].forEach((n,i)=>positions.writeFloatLE(n,i*4));
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[.2,.5,.3,1]}}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
 const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+positions.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binary=Buffer.alloc(8);binary.writeUInt32LE(36,0);binary.writeUInt32LE(0x004e4942,4);
 await page.locator('.native-model-file').setInputFiles({name:'test-model.glb',mimeType:'model/gltf-binary',buffer:Buffer.concat([header,padded,binary,positions])});
 await expect(page.locator('model-viewer')).toBeVisible();
 await expect(page.locator('.native-model-stage > [role=status]')).toHaveCount(0,{timeout:20000});
 await expect(page.locator('model-viewer')).toHaveAttribute('camera-controls','');
 await page.locator('.native-model-file').setInputFiles({name:'invalid.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('invalid')});
 await expect(page.getByRole('alert')).toContainText('valid binary glTF');
 await expect(page.locator('model-viewer')).toBeVisible();
 await page.getByRole('button',{name:'Use project model'}).click();
 await expect(page.locator('model-viewer')).toBeVisible();
 await expect(page.getByText('KiCad library component models',{exact:true})).toBeVisible();
});
