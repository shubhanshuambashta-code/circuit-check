import {test,expect} from '@playwright/test';

async function open3D(page:any){await page.goto('./');await page.getByRole('button',{name:'3D',exact:true}).click();await expect.poll(()=>page.locator('.native-model-stage model-viewer').evaluate((el:any)=>el.loaded)).toBe(true)}

test('identifier toggle hides labels independently from findings and retains body inspection',async({page})=>{
 await open3D(page);
 await expect(page.getByRole('checkbox',{name:'Identifiers',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'R1: Resistor',exact:true}).click();
 await expect(page.getByRole('region',{name:'Component R1 details'})).toBeVisible();
 await page.getByRole('checkbox',{name:'Identifiers',exact:true}).uncheck();
 await expect(page.locator('[data-component-label]')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Component R1 details'})).toHaveCount(0);
 expect(await page.locator('[data-finding-severity]').count()).toBeGreaterThan(0);
 await page.getByRole('checkbox',{name:'Identifiers',exact:true}).check();
 await expect(page.locator('[data-component-label]')).toHaveCount(9);
});

test('corner axes turn toward all board directions and preserve zoom',async({page})=>{
 await open3D(page);
 const model=page.locator('.native-model-stage model-viewer'),gizmo=page.getByRole('group',{name:'3D camera axes',exact:true});
 await expect(gizmo).toBeVisible();
 const radius=await model.evaluate((el:any)=>el.getCameraOrbit().radius);
 for(const [axis,sign,theta,phi] of [['X','positive',Math.PI/2,Math.PI/2],['X','negative',-Math.PI/2,Math.PI/2],['Y','positive',Math.PI,Math.PI/2],['Y','negative',0,Math.PI/2],['Z','positive',0,.001],['Z','negative',0,Math.PI-.001]] as const){
  const button=gizmo.getByRole('button',{name:`View from ${sign} ${axis} axis`,exact:true});
  await button.click();
  await expect.poll(()=>model.evaluate((el:any,{theta,phi})=>{const o=el.getCameraOrbit();return Math.sin(phi)*Math.sin(o.phi)*Math.cos(theta-o.theta)+Math.cos(phi)*Math.cos(o.phi)},{theta,phi})).toBeGreaterThan(.999);
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect(await model.evaluate((el:any)=>el.getCameraOrbit().radius)).toBeCloseTo(radius,1);
 }
 await gizmo.getByRole('button',{name:'Reset 3D orientation'}).click();
 await expect.poll(()=>model.evaluate((el:any)=>el.getCameraOrbit().theta)).toBeCloseTo(35*Math.PI/180,1);
 await gizmo.locator('[data-axis-tip=X] text').click();
 await expect(gizmo.getByRole('button',{name:'View from positive X axis',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.locator('.native-model-stage').screenshot({path:'screenshots/3d-axis-controls.png'});
 await page.getByRole('button',{name:'Geometry preview',exact:true}).click();
 await page.getByRole('button',{name:'View from positive Z axis',exact:true}).click();
 await expect(page.getByRole('button',{name:'View from positive Z axis',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('axis clicks synchronize linked revision cameras and remain keyboard accessible',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'Revision comparison',exact:true}).click();await page.getByRole('button',{name:'3D',exact:true}).click();
 const models=page.locator('.r2-comparison-boards model-viewer');
 for(const model of await models.all())await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 const axis=page.getByRole('button',{name:'View from positive X axis',exact:true}).first();
 await expect(axis).toBeEnabled();
 await axis.focus();await page.keyboard.press('Enter');
 for(const model of await models.all())await expect.poll(()=>model.evaluate((el:any)=>el.getCameraOrbit().theta)).toBeCloseTo(Math.PI/2,1);
 await page.getByRole('checkbox',{name:'Link 3D cameras',exact:true}).uncheck();
 await page.getByRole('button',{name:'View from negative X axis',exact:true}).first().click();
 await expect.poll(()=>models.first().evaluate((el:any)=>Math.sin(el.getCameraOrbit().theta))).toBeLessThan(-.999);
 expect(await models.last().evaluate((el:any)=>el.getCameraOrbit().theta)).toBeCloseTo(Math.PI/2,1);
});
