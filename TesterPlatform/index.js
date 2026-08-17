import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

console.log("API KEY EXISTS:", !!process.env.OPENROUTER_API_KEY);

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openrouter/free',
    messages: [
      {
        role: 'user',
        content: 'Who is the education ministeer of india?',
      },
    ],
  }),
});

const data = await response.json();

console.log(data.choices[0].message.content);