import {test,expect} from '@playwright/test';

test('merged workspace keeps 3D, assistant, original schematics and extension download available',async({page})=>{
 await page.goto('./');
 await page.getByRole('button',{name:'3D',exact:true}).click();
 await expect.poll(()=>page.locator('.native-model-stage model-viewer').evaluate((el:any)=>el.loaded)).toBe(true);
 await expect(page.getByRole('checkbox',{name:'Identifiers',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'Automatic schematic',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Original schematic available',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View original schematic',exact:true}).click();
 await expect(page.getByRole('button',{name:'Schematic',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Circuit assistant',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Circuit assistant',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 const download=page.getByRole('link',{name:'Download extension ZIP',exact:true});
 const href=await download.getAttribute('href');
 expect(href).toContain('/circuit-check/downloads/Circuit-Check-Multi-platform-v0.6.4.zip');
 const response=await page.request.get(href!);
 expect(response.ok()).toBeTruthy();
 expect((await response.body()).subarray(0,2).toString()).toBe('PK');
});
