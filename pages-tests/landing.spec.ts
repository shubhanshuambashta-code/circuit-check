import {test,expect} from '@playwright/test';

test('first visit opens review and offers clear project and example actions',async({page})=>{
 await page.goto('./');
 await expect(page.getByRole('button',{name:'Design review',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Upload project',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Explore example',exact:true}).click();
 await expect(page.getByRole('button',{name:'Design review',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Upload project',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Live uploads');
 await page.keyboard.press('Escape');
 for(const width of [1440,1024,768,390,360]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
});
