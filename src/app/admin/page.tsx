import type {Metadata} from 'next';
import {AdminPanel} from '@/components/admin-panel';
import './admin.css';
export const metadata:Metadata={title:'Administração',robots:{index:false,follow:false}};
export default function AdminPage(){return <AdminPanel/>;}
