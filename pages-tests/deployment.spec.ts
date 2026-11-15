import {test,expect} from '@playwright/test';

test('recorded review navigation, search, filters and comparison',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('./');
 await expect(page.getByText('Interactive recorded example',{exact:true})).toBeVisible();
 await expect(page.locator('.r2-workspace')).toBeVisible();
 await expect(page.locator('.cc-extension')).toHaveCount(0);
 const search=page.getByRole('combobox',{name:'Find component or net'});
 for(const name of ['R1','U1','GND']){
  await page.getByRole('button',{name:'Board',exact:true}).click();await search.fill(name);await search.press('Enter');
  await expect(page.locator('.board-svg [data-highlight-status=selected]').first()).toBeVisible();
  if(name!=='GND'){
   await page.getByRole('button',{name:'Schematic',exact:true}).click();
   await expect(page.locator('.schematic-canvas [data-highlight-status=selected]').first()).toBeVisible();
  }
 }
 await page.getByRole('button',{name:'Clear component or net search'}).click();
 await page.getByRole('button',{name:'Next issue',exact:true}).click();
 await expect(page.locator('.r2-review-navigation')).toContainText('Issue 2');
 await page.getByRole('button',{name:'Previous issue',exact:true}).click();
 await expect(page.locator('.r2-review-navigation')).toContainText('Issue 1');
 await page.getByLabel('Search findings',{exact:true}).fill('GND');
 await page.getByRole('button',{name:'Save current filters',exact:true}).click();
 await page.getByLabel('Filter name',{exact:true}).fill('Ground review');await page.getByRole('button',{name:'Save filter',exact:true}).click();
 await page.reload();await page.getByLabel('Saved filters',{exact:true}).selectOption('Ground review');
 await expect(page.getByLabel('Search findings',{exact:true})).toHaveValue('GND');
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await page.getByRole('button',{name:'Revision comparison',exact:true}).click();
 await expect(page.locator('.r2-comparison-boards .board-svg')).toHaveCount(2);
 await expect(page.locator('.r2-comparison-scope')).toContainText('Comparable engineering checks');
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 await expect(page.locator('.cc-extension')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Setup & diagnostics',exact:true})).toBeVisible();
 for(const width of [1440,1024,768,390,360]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);}
 expect(errors).toEqual([]);
});
