import {test,expect} from '@playwright/test';

async function open3D(page:any){await page.goto('./');await page.getByRole('button',{name:'3D',exact:true}).click();await expect.poll(()=>page.locator('.native-model-stage model-viewer').evaluate((el:any)=>el.loaded)).toBe(true)}

test('component inspection pins details, links findings, and retains 3D selection',async({page})=>{
 await open3D(page);
 await page.getByRole('button',{name:'R1: Resistor',exact:true}).click();
 const details=page.getByRole('region',{name:'Component R1 details',exact:true});
 await expect(details).toBeVisible();
 await page.mouse.move(10,10);
 await expect(details).toBeVisible();
 await expect(details).toContainText('Design value: Not specified.');
 await details.getByRole('button',{name:/Silkscreen overlaps/}).first().click();
 await expect(page.getByRole('button',{name:'3D',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.finding-3d-summary')).toContainText('Silkscreen overlaps');
 await expect(page.locator('[data-component-label=R1]')).toHaveAttribute('data-selected','true');
 await page.screenshot({path:'screenshots/upgraded-review-desktop.png',fullPage:true});
 await details.getByRole('button',{name:'Close component details'}).click();
 await expect(details).toHaveCount(0);
 await page.locator('.r2-issue').filter({hasText:'Track width below configured minimum'}).first().click();
 await expect(page.locator('[data-selected-object]').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'3D',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('model inventory searches components and supports inspecting and supplying models',async({page})=>{
 await open3D(page);
 await page.locator('.model-inventory summary').click();
 await expect(page.locator('.model-inventory summary')).toContainText('9 verified library assignments');
 await page.getByRole('textbox',{name:'Find a component',exact:true}).fill('R2');
 await expect(page.locator('.model-inventory li')).toHaveCount(1);
 await page.getByRole('button',{name:'Inspect component R2',exact:true}).click();
 await expect(page.getByRole('region',{name:'Component R2 details'})).toBeVisible();
 await page.getByRole('button',{name:'Upload project with models'}).click();
 await expect(page.getByRole('dialog')).toContainText('Live uploads');
});

test('revision 3D marks moved components and links camera orbit and zoom',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'Revision comparison',exact:true}).click();
 await page.getByRole('button',{name:'3D',exact:true}).click();
 const models=page.locator('.r2-comparison-boards model-viewer');
 await expect(models).toHaveCount(2);
 for(const model of await models.all())await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 await expect(page.locator('[data-component-label=R2][data-change=modified]')).toHaveCount(2);
 await expect(page.locator('.comparison-movement')).toContainText('R2: moved 2.00 mm');
 await models.first().scrollIntoViewIfNeeded();
 const initial=await models.first().evaluate((el:any)=>el.getCameraOrbit().theta);
 const rect=await models.first().boundingBox();expect(rect).not.toBeNull();
 await page.mouse.move(rect!.x+rect!.width*.75,rect!.y+rect!.height*.2);
 await page.mouse.down();await page.mouse.move(rect!.x+rect!.width*.75-70,rect!.y+rect!.height*.2+20,{steps:12});await page.mouse.up();
 await expect.poll(async()=>Math.abs(await models.first().evaluate((el:any)=>el.getCameraOrbit().theta)-initial)).toBeGreaterThan(.05);
 await expect.poll(async()=>{const angles=await models.evaluateAll((els:any[])=>els.map(el=>el.getCameraOrbit().theta));return Math.abs(angles[0]-angles[1])}).toBeLessThan(.02);
 await page.mouse.wheel(0,-120);
 await expect.poll(async()=>{const radii=await models.evaluateAll((els:any[])=>els.map(el=>el.getCameraOrbit().radius));return Math.abs(radii[0]-radii[1])}).toBeLessThan(.2);
 await page.getByLabel('Link 3D cameras',{exact:true}).uncheck();
 await expect(page.getByLabel('Link 3D cameras',{exact:true})).not.toBeChecked();
});

test('mobile component details stay open after tap and support keyboard dismissal',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await open3D(page);
 await page.getByRole('button',{name:'U1: Integrated circuit',exact:true}).click();
 const details=page.getByRole('region',{name:'Component U1 details'});
 await expect(details).toBeVisible();
 await details.scrollIntoViewIfNeeded();
 await page.screenshot({path:'screenshots/upgraded-review-mobile.png',fullPage:true});
 await details.getByRole('button',{name:'Close component details'}).focus();
 await page.keyboard.press('Escape');
 await expect(details).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
