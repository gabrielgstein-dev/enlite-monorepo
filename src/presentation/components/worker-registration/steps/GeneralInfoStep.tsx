import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { generalInfoSchema, GeneralInfoFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { WizardNavigation } from '../WizardNavigation';
import { PhoneInputIntl } from '@presentation/components/common/PhoneInputIntl';

interface GeneralInfoStepProps {
  onValidationChange?: (isValid: boolean) => void;
}

export function GeneralInfoStep({ onValidationChange }: GeneralInfoStepProps) {
  const { t } = useTranslation();
  const { data, updateGeneralInfo, markStepCompleted, markStepIncomplete, goToNextStep, isFieldReadonly, workerId } = useWorkerRegistrationStore();
  const { saveStep } = useWorkerApi();
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(data.generalInfo.profilePhoto || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    control,
  } = useForm<GeneralInfoFormData>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: {
      fullName: data.generalInfo.fullName || '',
      lastName: data.generalInfo.lastName || '',
      cpf: data.generalInfo.cpf || '',
      phone: data.generalInfo.phone || '',
      email: data.generalInfo.email || '',
      birthDate: data.generalInfo.birthDate || '',
      sex: (data.generalInfo.sex as 'male' | 'female') || undefined,
      gender: (data.generalInfo.gender as 'male' | 'female' | 'other') || undefined,
      documentType: (data.generalInfo.documentType as 'CPF' | 'RG' | 'CNH') || 'CPF',
      professionalLicense: data.generalInfo.professionalLicense || '',
      languages: data.generalInfo.languages?.length ? (data.generalInfo.languages as Array<'pt' | 'es' | 'en'>) : [],
      profession: (data.generalInfo.profession as 'caregiver' | 'nurse' | 'psychologist' | 'physiotherapist') || undefined,
      knowledgeLevel: (data.generalInfo.knowledgeLevel as 'bachelor' | 'technical' | 'masters' | 'doctorate') || undefined,
      experienceTypes: data.generalInfo.experienceTypes?.length ? (data.generalInfo.experienceTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) : [],
      yearsExperience: (data.generalInfo.yearsExperience as '0_2' | '3_5' | '6_10' | '10_plus') || undefined,
      preferredTypes: data.generalInfo.preferredTypes?.length ? (data.generalInfo.preferredTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) : [],
      preferredAgeRange: (data.generalInfo.preferredAgeRange as 'children' | 'adolescents' | 'adults' | 'elderly') || undefined,
      profilePhoto: data.generalInfo.profilePhoto || null,
    },
    mode: 'onChange',
  });

  const fullName = watch('fullName');
  const lastName = watch('lastName');
  const cpf = watch('cpf');
  const phone = watch('phone');
  const email = watch('email');
  const birthDate = watch('birthDate');
  const sex = watch('sex');
  const gender = watch('gender');
  const documentType = watch('documentType');
  const professionalLicense = watch('professionalLicense');
  const languages = watch('languages');
  const profession = watch('profession');
  const knowledgeLevel = watch('knowledgeLevel');
  const experienceTypes = watch('experienceTypes');
  const yearsExperience = watch('yearsExperience');
  const preferredTypes = watch('preferredTypes');
  const preferredAgeRange = watch('preferredAgeRange');
  const profilePhoto = watch('profilePhoto');

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(isValid);
    }
    
    if (isValid) {
      markStepCompleted('general-info');
    } else {
      markStepIncomplete('general-info');
    }
  }, [isValid, markStepCompleted, markStepIncomplete, onValidationChange]);

  useEffect(() => {
    updateGeneralInfo({
      fullName,
      lastName,
      cpf,
      phone,
      email,
      birthDate,
      sex,
      gender,
      documentType,
      professionalLicense,
      languages,
      profession,
      knowledgeLevel,
      experienceTypes,
      yearsExperience,
      preferredTypes,
      preferredAgeRange,
      profilePhoto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, lastName, cpf, phone, email, birthDate, sex, gender, documentType, professionalLicense, languages, profession, knowledgeLevel, experienceTypes, yearsExperience, preferredTypes, preferredAgeRange, profilePhoto]);

  const onSubmit = async (formData: GeneralInfoFormData) => {
    if (!workerId) {
      // No workerId yet — still advance locally (server will init later)
      goToNextStep();
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await saveStep(workerId, 2, {
        firstName: formData.fullName.split(' ')[0] || formData.fullName,
        lastName: formData.lastName,
        sex: formData.sex,
        gender: formData.gender,
        birthDate: formData.birthDate,
        documentType: formData.documentType,
        documentNumber: formData.cpf,
        phone: formData.phone,
        profilePhotoUrl: formData.profilePhoto || undefined,
        languages: formData.languages,
        profession: formData.profession,
        knowledgeLevel: formData.knowledgeLevel,
        titleCertificate: formData.professionalLicense,
        experienceTypes: formData.experienceTypes,
        yearsExperience: formData.yearsExperience,
        preferredTypes: formData.preferredTypes,
        preferredAgeRange: formData.preferredAgeRange,
        termsAccepted: true,
        privacyAccepted: true,
      });
      goToNextStep();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('workerRegistration.generalInfo.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setProfilePhotoPreview(result);
        setValue('profilePhoto', result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col items-center gap-[28px] w-full max-w-[1200px]">
      {/* Profile Photo */}
      <div className="flex flex-col items-center gap-3 w-full">
        <div className="w-[64px] h-[64px] relative flex items-center justify-center overflow-hidden rounded-full">
          {profilePhotoPreview ? (
            <img 
              src={profilePhotoPreview} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M32 64C14.3479 64 0 49.6521 0 32C0 14.3479 14.3479 0 32 0C49.6521 0 64 14.3479 64 32C64 49.6521 49.6521 64 32 64ZM32 4.46512C16.8186 4.46512 4.46512 16.8186 4.46512 32C4.46512 47.1814 16.8186 59.5349 32 59.5349C47.1814 59.5349 59.5349 47.1814 59.5349 32C59.5349 16.8186 47.1814 4.46512 32 4.46512Z" fill="#180149"/>
              <svg x="20.03" y="12.59" width="24" height="24" viewBox="0 0 24 24">
                <path d="M12.3237 23.9628C12.2642 23.9628 12.1749 23.9628 12.1153 23.9628C12.026 23.9628 11.907 23.9628 11.8177 23.9628C5.06046 23.7544 0 18.4856 0 11.9963C0 5.38791 5.38791 0 11.9963 0C18.6047 0 23.9926 5.38791 23.9926 11.9963C23.9628 18.5154 18.8726 23.7544 12.413 23.9628C12.3535 23.9628 12.3535 23.9628 12.3237 23.9628ZM11.9665 4.43535C7.79907 4.43535 4.43535 7.82884 4.43535 11.9665C4.43535 16.0447 7.62046 19.3488 11.6688 19.4977C11.7581 19.4679 12.0558 19.4679 12.3535 19.4977C16.3423 19.2893 19.4679 16.0149 19.4977 11.9665C19.4977 7.82884 16.134 4.43535 11.9665 4.43535Z" fill="#180149"/>
              </svg>
              <svg x="9.69" y="40.02" width="45" height="24" viewBox="0 0 45 24">
                <path d="M22.3047 23.9777C14.2973 23.9777 6.64707 21.0009 0.723348 15.5833C0.187534 15.107 -0.0506046 14.3926 0.00893025 13.7079C0.395907 10.1656 2.5987 6.8614 6.26009 4.42046C15.1308 -1.47349 29.5085 -1.47349 38.3494 4.42046C42.0108 6.89116 44.2136 10.1656 44.6006 13.7079C44.6899 14.4223 44.422 15.107 43.8861 15.5833C37.9624 21.0009 30.3122 23.9777 22.3047 23.9777ZM4.68242 13.1126C9.62381 17.2502 15.8452 19.5126 22.3047 19.5126C28.7643 19.5126 34.9857 17.2502 39.9271 13.1126C39.3913 11.2967 37.9624 9.54046 35.8489 8.11163C28.5261 3.22977 16.1131 3.22977 8.73079 8.11163C6.6173 9.54046 5.21823 11.2967 4.68242 13.1126Z" fill="#180149"/>
              </svg>
            </svg>
          )}
        </div>
        <label className="w-[400px] h-[56px] bg-primary text-white rounded-[608px] font-poppins font-semibold text-base hover:bg-[#2a0269] transition-colors flex items-center justify-center cursor-pointer">
          {t('workerRegistration.generalInfo.addProfilePhoto')}
          <input
            type="file"
            accept="image/*"
            onChange={handleProfilePhotoUpload}
            className="hidden"
          />
        </label>
      </div>

      {/* Form Fields */}
      <div className="w-full flex flex-col gap-[32px]">
        {/* Row 1: Email and Idiomas */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.email')}</label>
            <div className="flex flex-col h-12 items-start justify-around gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] overflow-hidden border-[1.5px] border-solid border-[#4B5563] bg-transparent focus-within:border-primary transition-colors">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <input
                  type="email"
                  {...register('email')}
                  readOnly={isFieldReadonly('email')}
                  placeholder={t('workerRegistration.generalInfo.emailPlaceholder')}
                  className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
                />
                <img className="relative w-6 h-6" alt="Sms" src="https://c.animaapp.com/Bbli6X7n/img/sms@2x.png" />
              </div>
            </div>
            {errors.email && <span className="text-red-500 text-xs">{errors.email.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.languages')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('languages.0')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="pt">{t('workerRegistration.generalInfo.portuguese')}</option>
                  <option value="es">{t('workerRegistration.generalInfo.spanish')}</option>
                  <option value="en">{t('workerRegistration.generalInfo.english')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.languages && <span className="text-red-500 text-xs">{errors.languages.message}</span>}
          </div>
        </div>

        {/* Row 2: Nome and Sobrenome */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.firstName')}</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors">
              <input
                type="text"
                {...register('fullName')}
                readOnly={isFieldReadonly('fullName')}
                placeholder={t('workerRegistration.generalInfo.firstNamePlaceholder')}
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.fullName && <span className="text-red-500 text-xs">{errors.fullName.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.lastName')}</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors">
              <input
                type="text"
                {...register('lastName')}
                placeholder={t('workerRegistration.generalInfo.lastNamePlaceholder')}
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.lastName && <span className="text-red-500 text-xs">{errors.lastName.message}</span>}
          </div>
        </div>

        {/* Row 3: Sexo and Gênero */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.sex')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('sex')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="male">{t('workerRegistration.generalInfo.male')}</option>
                  <option value="female">{t('workerRegistration.generalInfo.female')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.sex && <span className="text-red-500 text-xs">{errors.sex.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.gender')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('gender')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="male">{t('workerRegistration.generalInfo.male')}</option>
                  <option value="female">{t('workerRegistration.generalInfo.female')}</option>
                  <option value="other">{t('workerRegistration.generalInfo.other')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Data nascimento, Tipo documento, Número documento */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 w-[420px]">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.birthDate')}</label>
            <div className="flex flex-col h-12 items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <input
                  type="text"
                  {...register('birthDate')}
                  readOnly={isFieldReadonly('birthDate')}
                  placeholder={t('workerRegistration.generalInfo.birthDatePlaceholder')}
                  className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
                />
                <img className="absolute right-0 w-[22.32px] h-[24.32px] pointer-events-none" alt="Calendar" src="https://c.animaapp.com/Bbli6X7n/img/calendar@2x.png" />
              </div>
            </div>
            {errors.birthDate && <span className="text-red-500 text-xs">{errors.birthDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1 w-80">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.documentType')}</label>
             <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('documentType')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="CPF">{t('workerRegistration.generalInfo.cpf')}</option>
                  <option value="RG">{t('workerRegistration.generalInfo.rg')}</option>
                  <option value="CNH">{t('workerRegistration.generalInfo.cnh')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.documentNumber')}</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <input
                type="text"
                {...register('cpf')}
                readOnly={isFieldReadonly('cpf')}
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.cpf && <span className="text-red-500 text-xs">{errors.cpf.message}</span>}
          </div>
        </div>

        {/* Row 5: Número telefone and Profissão */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.phone')}</label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <PhoneInputIntl
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t('workerRegistration.generalInfo.phonePlaceholder')}
                  readOnly={isFieldReadonly('phone')}
                  className="border-[#4B5563] focus-within:border-primary"
                  icon={
                    <img className="relative w-6 h-6" alt="Call" src="https://c.animaapp.com/Bbli6X7n/img/vuesax-outline-call@2x.png" />
                  }
                />
              )}
            />
            {errors.phone && <span className="text-red-500 text-xs">{errors.phone.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.profession')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('profession')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="caregiver">{t('workerRegistration.generalInfo.caregiver')}</option>
                  <option value="nurse">{t('workerRegistration.generalInfo.nurse')}</option>
                  <option value="psychologist">{t('workerRegistration.generalInfo.psychologist')}</option>
                  <option value="physiotherapist">{t('workerRegistration.generalInfo.physiotherapist')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 6: Nível conhecimento and Título certificado */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.knowledgeLevel')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('knowledgeLevel')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="bachelor">{t('workerRegistration.generalInfo.bachelor')}</option>
                  <option value="technical">{t('workerRegistration.generalInfo.technical')}</option>
                  <option value="masters">{t('workerRegistration.generalInfo.masters')}</option>
                  <option value="doctorate">{t('workerRegistration.generalInfo.doctorate')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.knowledgeLevel && <span className="text-red-500 text-xs">{errors.knowledgeLevel.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.professionalLicense')}</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <input
                type="text"
                {...register('professionalLicense')}
                readOnly={isFieldReadonly('professionalLicense')}
                placeholder={t('workerRegistration.generalInfo.professionalLicensePlaceholder')}
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.professionalLicense && <span className="text-red-500 text-xs">{errors.professionalLicense.message}</span>}
          </div>
        </div>

        {/* Row 7: Experiência pacientes and Anos experiência */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.experienceTypes')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('experienceTypes.0')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="elderly">{t('workerRegistration.generalInfo.elderly')}</option>
                  <option value="adhd">{t('workerRegistration.generalInfo.adhd')}</option>
                  <option value="children">{t('workerRegistration.generalInfo.children')}</option>
                  <option value="adolescents">{t('workerRegistration.generalInfo.adolescents')}</option>
                  <option value="adults">{t('workerRegistration.generalInfo.adults')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.experienceTypes && <span className="text-red-500 text-xs">{errors.experienceTypes.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.yearsExperience')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('yearsExperience')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="0_2">{t('workerRegistration.generalInfo.years0to2')}</option>
                  <option value="3_5">{t('workerRegistration.generalInfo.years3to5')}</option>
                  <option value="6_10">{t('workerRegistration.generalInfo.years6to10')}</option>
                  <option value="10_plus">{t('workerRegistration.generalInfo.years10plus')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.yearsExperience && <span className="text-red-500 text-xs">{errors.yearsExperience.message}</span>}
          </div>
        </div>

        {/* Row 8: Preferência trabalhar and Preferência faixa etária */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.preferredTypes')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('preferredTypes.0')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="adhd">{t('workerRegistration.generalInfo.adhd')}</option>
                  <option value="elderly">{t('workerRegistration.generalInfo.elderly')}</option>
                  <option value="children">{t('workerRegistration.generalInfo.children')}</option>
                  <option value="adolescents">{t('workerRegistration.generalInfo.adolescents')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.preferredTypes && <span className="text-red-500 text-xs">{errors.preferredTypes.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">{t('workerRegistration.generalInfo.preferredAgeRange')}</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select {...register('preferredAgeRange')} className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option value="">{t('workerRegistration.generalInfo.select')}</option>
                  <option value="children">{t('workerRegistration.generalInfo.ageRangeChildren')}</option>
                  <option value="adolescents">{t('workerRegistration.generalInfo.ageRangeAdolescents')}</option>
                  <option value="adults">{t('workerRegistration.generalInfo.ageRangeAdults')}</option>
                  <option value="elderly">{t('workerRegistration.generalInfo.ageRangeElderly')}</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
            {errors.preferredAgeRange && <span className="text-red-500 text-xs">{errors.preferredAgeRange.message}</span>}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {saveError}
        </div>
      )}

      <WizardNavigation isCurrentStepValid={isValid} isSubmitting={isSaving} />
    </form>
  );
}
