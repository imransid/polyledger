import { formatCount } from '../lib/format';

export const bn = {
  otherLanguage: 'English',
  back: 'ফিরে যান',
  errors: {
    offline: 'সার্ভারে পৌঁছানো যাচ্ছে না। ওয়াই-ফাই সংযোগ দেখুন।',
    tooManyAttempts: 'অনেকবার চেষ্টা হয়েছে। এক মিনিট পরে আবার চেষ্টা করুন।',
    unexpected: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।',
  },
  pairing: {
    title: 'ট্যাবলেট যুক্ত করুন',
    hint: 'অফিস থেকে পাওয়া 8 অক্ষরের কোডটি লিখুন। এটি একবারই লাগবে।',
    code: 'পেয়ারিং কোড',
    pair: 'যুক্ত করুন',
    pairing: 'যুক্ত হচ্ছে…',
    wrongCode: 'কোডটি ভুল অথবা এর মেয়াদ শেষ। অফিস থেকে নতুন কোড নিন।',
  },
  sync: {
    online: 'অনলাইন',
    offline: 'অফলাইন',
    lastSynced: (moment: string) => `শেষ সিঙ্ক: ${moment}`,
    neverSynced: 'এখনো সিঙ্ক হয়নি',
    waiting: (count: number) => `পাঠানো বাকি: ${formatCount(count)}টি রেকর্ড`,
    failed: 'শেষবার সিঙ্ক হয়নি',
    syncNow: 'এখন সিঙ্ক করুন',
    syncing: 'সিঙ্ক হচ্ছে…',
  },
  signIn: {
    pickName: 'আপনার নাম বেছে নিন',
    nobody:
      'এই ট্যাবলেটে সাইন ইন করার মতো কেউ নেই। সিঙ্ক করুন, অথবা অফিসকে পিন দিতে বলুন।',
    enterPin: 'আপনার পিন দিন',
    pinEntered: (count: number) => `${count}টি সংখ্যা দেওয়া হয়েছে`,
    delete: 'মুছুন',
    signIn: 'সাইন ইন',
    wrongPin: 'পিন ভুল হয়েছে। আবার চেষ্টা করুন।',
    lockedTitle: 'সাময়িকভাবে বন্ধ',
    lockedOut: (minutes: number) =>
      `অনেকবার ভুল পিন দেওয়া হয়েছে। এই ট্যাবলেটে ${formatCount(minutes)} মিনিট পরে আবার চেষ্টা করুন।`,
    needsConnection:
      'সাইন ইন করতে সার্ভারের সাথে সংযোগ লাগবে। ওয়াই-ফাই দেখুন।',
  },
  home: {
    done: 'কাজ শেষ',
    jobCards: 'জব কার্ড',
    needsSupervisor: (count: number) =>
      `সুপারভাইজার দেখবেন (${formatCount(count)})`,
    noJobCards: 'এই ফ্লোরে এখন কোনো জব কার্ড নেই।',
    planned: (pieces: number) => `লক্ষ্য: ${formatCount(pieces)} পিস`,
  },
  jobCardStatus: {
    PLANNED: 'পরিকল্পিত',
    RELEASED: 'শুরুর অপেক্ষায়',
    RUNNING: 'চলছে',
    CLOSED: 'বন্ধ',
    CANCELLED: 'বাতিল',
  },
  needsSupervisor: {
    hint: 'সার্ভার এই রেকর্ডগুলো নেয়নি। সুপারভাইজারকে জানান; অফিস থেকে ঠিক করা হবে।',
    empty: 'সুপারভাইজারের দেখার মতো কিছু নেই।',
    PRODUCTION_ENTRY: 'উৎপাদন',
    WASTE_ENTRY: 'ওয়েস্ট',
    recordedAt: (moment: string) => `লেখা হয়েছে: ${moment}`,
  },
};

export type Messages = typeof bn;
