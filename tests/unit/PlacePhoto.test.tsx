import {afterEach,describe,expect,it,vi} from 'vitest'
import {cleanup,render,screen,waitFor} from '@testing-library/react'
import {PlacePhoto} from '../../src/PlacePhoto.tsx'

afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('real venue photo',()=>{
 it('renders a Google Places photo with required author attribution',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:()=>({
   photoUrl:'https://lh3.googleusercontent.com/sample',
   attributions:[{name:'Actual photographer',url:'https://maps.google.com/maps/contrib/123'}]
  })}))
  render(<PlacePhoto placeId="ChIJABC_123" placeName="Test Cafe" mapUrl="https://maps.google.com"/>)
  await waitFor(()=>expect(screen.getByRole('img').getAttribute('src')).toContain('googleusercontent'))
  expect(screen.getByRole('img').getAttribute('alt')).toContain('Test Cafe')
  expect(screen.getByText('Actual photographer').closest('a')?.getAttribute('href')).toContain('maps.google.com')
 })
 it('does not fabricate an image if no photo is available',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}))
  render(<PlacePhoto placeId="ChIJABC_123" placeName="Test Cafe" mapUrl="https://maps.google.com"/>)
  await waitFor(()=>expect(screen.getByText('此地點暫無可顯示的實景照片')).toBeTruthy())
  expect(screen.queryByRole('img')).toBeNull()
 })
})
