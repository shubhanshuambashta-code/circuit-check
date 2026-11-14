import {test,expect} from '@playwright/test';

test('3D shows error and warning markers, selects findings, and filters each severity',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'3D',exact:true}).click();
 const model=page.locator('.native-model-stage model-viewer');
 await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 const errors=page.locator('[data-finding-severity=error]'),warnings=page.locator('[data-finding-severity=warning]');
 expect(await errors.count()).toBeGreaterThan(0);expect(await warnings.count()).toBeGreaterThan(0);
 const error=errors.first(),errorName=await error.getAttribute('aria-label');
 await error.click();
 await expect(page.locator('.finding-3d-summary')).toContainText(errorName!.split(': ')[1].split(', ')[0]);
 await expect(error).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'3D',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('checkbox',{name:/^Errors \(/}).uncheck();
 await expect(errors).toHaveCount(0);expect(await warnings.count()).toBeGreaterThan(0);
 await warnings.filter({visible:true}).first().click();
 await expect(page.getByRole('region',{name:'Findings at selected 3D location'})).toBeVisible();
 await page.getByRole('checkbox',{name:/^Warnings \(/}).uncheck();
 await expect(warnings).toHaveCount(0);
 await page.getByRole('checkbox',{name:/^Errors \(/}).check();
 expect(await errors.count()).toBeGreaterThan(0);
 await page.getByRole('checkbox',{name:/^Warnings \(/}).check();
 await page.locator('.native-model-stage').screenshot({path:'screenshots/3d-errors-warnings.png'});
});

test('severity highlights remain available in geometry mode with labels hidden',async({page})=>{
 await page.goto('./');await page.getByRole('button',{name:'3D',exact:true}).click();
 await page.getByRole('button',{name:'Geometry preview',exact:true}).click();
 await page.getByRole('checkbox',{name:'Identifiers',exact:true}).uncheck();
 const model=page.locator('.board3d-webgl model-viewer');
 await expect.poll(()=>model.evaluate((el:any)=>el.loaded)).toBe(true);
 await expect(page.locator('[data-component-label]')).toHaveCount(0);
 expect(await page.locator('[data-finding-severity=error]').count()).toBeGreaterThan(0);
 expect(await page.locator('[data-finding-severity=warning]').count()).toBeGreaterThan(0);
 await page.locator('[data-finding-severity=warning]').first().press('Enter');
 await expect(page.getByRole('region',{name:'Findings at selected 3D location'})).toBeVisible();
});
