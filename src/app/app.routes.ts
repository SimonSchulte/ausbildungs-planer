import { Routes } from '@angular/router';
import { Jahresplan } from './pages/jahresplan/jahresplan';

export const routes: Routes = [
  { path: '', component: Jahresplan, title: 'Ausbildungsplaner' },
  { path: '**', redirectTo: '' },
];
