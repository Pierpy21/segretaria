
"use client"; 

import Button from './components/Button';

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-4">Il mio progetto</h1>
      
      <Button onClick={() => alert('Suca!')}>
        Cliccami
      </Button>
    </main>
  );
}