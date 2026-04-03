import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      title: 'Emergency SOS',
      sub: 'One-tap broadcast to nearby volunteers and admins.',
      btnVerify: 'TAP 3 TIMES TO VERIFY & SEND',
      btnRemaining: 'TAP {{count}} MORE TIME(S)',
      typeMedical: 'Medical',
      typeFood: 'Food',
      typeRescue: 'Rescue',
      typeShelter: 'Shelter',
      typeMedicine: 'Medicine',
      typeElderSupport: 'Elder Support',
      typeChildSupport: 'Child Support',
      typePharmacyNeeded: 'Pharmacy Needed',
      typeBloodRequired: 'Blood Required',
      typeAny: 'Any',
      locDetected: 'Location Locked',
      processing: 'Routing...',
      queued: 'Queued Locally',
      synced: 'SOS Broadcasted',
      successMsg: 'Help is being routed to your coordinates.',
      viewMap: 'View on Live Map',
      lang: 'Language',
      offlineProtocol: 'Offline Priority Protocol:',
      offlineMsg: 'Using IndexedDB Service Workers to queue requests securely in compromised network zones.'
    }
  },
  hi: {
    translation: {
      title: 'आपातकालीन SOS',
      sub: 'पास के स्वयंसेवकों को एक टैप में प्रसारण।',
      btnVerify: 'भेजने के लिए 3 बार दबाएं',
      btnRemaining: '{{count}} बार और दबाएं',
      typeMedical: 'चिकित्सा',
      typeFood: 'भोजन',
      typeRescue: 'बचाव',
      typeShelter: 'आश्रय',
      typeMedicine: 'दवा',
      typeElderSupport: 'बुजुर्ग सहायता',
      typeChildSupport: 'बाल सहायता',
      typePharmacyNeeded: 'फार्मेसी की जरूरत',
      typeBloodRequired: 'रक्त की आवश्यकता',
      typeAny: 'कोई भी',
      locDetected: 'स्थान प्राप्त हुआ',
      processing: 'भेजा जा रहा है...',
      queued: 'स्थानीय रूप से सहेजा गया',
      synced: 'SOS भेजा गया',
      successMsg: 'मदद आपके स्थान पर भेजी जा रही है।',
      viewMap: 'लाइव मैप पर देखें',
      lang: 'भाषा',
      offlineProtocol: 'ऑफ़लाइन प्रोटोकॉल:',
      offlineMsg: 'समझौता किए गए नेटवर्क क्षेत्रों में सुरक्षित रूप से कतारबद्ध करने के लिए IndexedDB उपयोग कर रहा है।'
    }
  },
  mr: {
    translation: {
      title: 'आणीबाणी SOS',
      sub: 'जवळपासच्या स्वयंसेवकांना एका टॅपमध्ये प्रसारण.',
      btnVerify: 'पाठवण्यासाठी ३ वेळा टॅप करा',
      btnRemaining: 'अजून {{count}} वेळा टॅप करा',
      typeMedical: 'वैद्यकीय',
      typeFood: 'अन्न',
      typeRescue: 'बचाव',
      typeShelter: 'निवारा',
      typeMedicine: 'औषध',
      typeElderSupport: 'वृद्ध मदत',
      typeChildSupport: 'बाल मदत',
      typePharmacyNeeded: 'फार्मसी आवश्यक',
      typeBloodRequired: 'रक्ताची आवश्यकता',
      typeAny: 'कोणतेही',
      locDetected: 'स्थान निश्चित केले',
      processing: 'प्रक्रिया करत आहे...',
      queued: 'स्थानिकरित्या जतन केले',
      synced: 'SOS प्रसारित',
      successMsg: 'मदत पाठवली जात आहे.',
      viewMap: 'थेट नकाशावर पहा',
      lang: 'भाषा',
      offlineProtocol: 'उपकेंद्र जोडणी:',
      offlineMsg: 'इंटरनेट नसतानाही IndexedDB वापरून आपत्कालीन विनंत्या जतन करत आहे.'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
