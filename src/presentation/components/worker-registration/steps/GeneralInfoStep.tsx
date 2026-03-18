import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { generalInfoSchema, GeneralInfoFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { WizardNavigation } from '../WizardNavigation';

interface GeneralInfoStepProps {
  onValidationChange?: (isValid: boolean) => void;
}

export function GeneralInfoStep({ onValidationChange }: GeneralInfoStepProps) {
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
  } = useForm<GeneralInfoFormData>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: {
      fullName: data.generalInfo.fullName || '',
      cpf: data.generalInfo.cpf || '',
      phone: data.generalInfo.phone || '',
      email: data.generalInfo.email || '',
      birthDate: data.generalInfo.birthDate || '',
      professionalLicense: data.generalInfo.professionalLicense || '',
      profilePhoto: data.generalInfo.profilePhoto || null,
    },
    mode: 'onChange',
  });

  const fullName = watch('fullName');
  const cpf = watch('cpf');
  const phone = watch('phone');
  const email = watch('email');
  const birthDate = watch('birthDate');
  const professionalLicense = watch('professionalLicense');
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
      cpf,
      phone,
      email,
      birthDate,
      professionalLicense,
      profilePhoto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, cpf, phone, email, birthDate, professionalLicense, profilePhoto]);

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
        lastName: formData.fullName.split(' ').slice(1).join(' ') || '',
        phone: formData.phone,
        birthDate: formData.birthDate,
        documentNumber: formData.cpf,
        documentType: 'CPF',
        profilePhotoUrl: formData.profilePhoto || undefined,
      });
      goToNextStep();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.');
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
          Adicionar foto de perfil
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
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">E-mail</label>
            <div className="flex flex-col h-12 items-start justify-around gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] overflow-hidden border-[1.5px] border-solid border-[#4B5563] bg-transparent focus-within:border-primary transition-colors">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <input
                  type="email"
                  {...register('email')}
                  readOnly={isFieldReadonly('email')}
                  placeholder="albertomarquez123@gmail.com"
                  className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
                />
                <img className="relative w-6 h-6" alt="Sms" src="https://c.animaapp.com/Bbli6X7n/img/sms@2x.png" />
              </div>
            </div>
            {errors.email && <span className="text-red-500 text-xs">{errors.email.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Idiomas</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563]">
              <div className="inline-flex items-center gap-2 relative top-[9px] left-4">
                <div className="inline-flex items-center justify-center gap-2.5 px-4 py-1 relative flex-[0_0_auto] bg-primary rounded-[100px]">
                  <div className="relative w-fit mt-[-1.00px] text-white whitespace-nowrap font-lexend font-medium text-[14px] leading-[150%]">
                    Português
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Nome and Sobrenome */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Nome</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors">
              <input
                type="text"
                {...register('fullName')}
                readOnly={isFieldReadonly('fullName')}
                placeholder="Alberto"
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.fullName && <span className="text-red-500 text-xs">{errors.fullName.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Sobrenome</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors">
              <input
                type="text"
                placeholder="Marquez"
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
          </div>
        </div>

        {/* Row 3: Sexo and Gênero */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Sexo</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Masculino</option>
                  <option>Feminino</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Gênero</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Masculino</option>
                  <option>Feminino</option>
                  <option>Outro</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Data nascimento, Tipo documento, Número documento */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 w-[420px]">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Data de nascimento</label>
            <div className="flex flex-col h-12 items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <input
                  type="text"
                  {...register('birthDate')}
                  readOnly={isFieldReadonly('birthDate')}
                  placeholder="18/03/1960"
                  className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
                />
                <img className="absolute right-0 w-[22.32px] h-[24.32px] pointer-events-none" alt="Calendar" src="https://c.animaapp.com/Bbli6X7n/img/calendar@2x.png" />
              </div>
            </div>
            {errors.birthDate && <span className="text-red-500 text-xs">{errors.birthDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1 w-80">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Tipo do documento</label>
             <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>CPF</option>
                  <option>RG</option>
                  <option>CNH</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Número do documento</label>
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
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Número de telefone</label>
            <div className="flex flex-col h-12 items-start justify-around gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] overflow-hidden border-[1.5px] border-solid border-[#4B5563] bg-transparent focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <input
                  type="tel"
                  {...register('phone')}
                  readOnly={isFieldReadonly('phone')}
                  placeholder="+55 (11) 92005-1588"
                  className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
                />
                <img className="relative w-6 h-6" alt="Call" src="https://c.animaapp.com/Bbli6X7n/img/vuesax-outline-call@2x.png" />
              </div>
            </div>
            {errors.phone && <span className="text-red-500 text-xs">{errors.phone.message}</span>}
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Profissão</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Cuidador</option>
                  <option>Enfermeiro</option>
                  <option>Psicólogo</option>
                  <option>Fisioterapeuta</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 6: Nível conhecimento and Título certificado */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Nível de conhecimento</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Bacharelado</option>
                  <option>Técnico</option>
                  <option>Mestrado</option>
                  <option>Doutorado</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Título ou certificado</label>
            <div className="h-12 overflow-hidden relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <input
                type="text"
                {...register('professionalLicense')}
                readOnly={isFieldReadonly('professionalLicense')}
                placeholder="Licenciado em psicologia"
                className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            {errors.professionalLicense && <span className="text-red-500 text-xs">{errors.professionalLicense.message}</span>}
          </div>
        </div>

        {/* Row 7: Experiência pacientes and Anos experiência */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Com que tipos de pacientes você tem experiência?</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Idosos, Portadores de TDAH</option>
                  <option>Crianças</option>
                  <option>Adolescentes</option>
                  <option>Adultos</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Anos de experiência</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>10 ou +</option>
                  <option>0-2 anos</option>
                  <option>3-5 anos</option>
                  <option>6-10 anos</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
        </div>

        {/* Row 8: Preferência trabalhar and Preferência faixa etária */}
        <div className="flex w-[1200px] items-start gap-5 relative">
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Com que tipos de pacientes você prefere trabalhar?</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Portadores de TDAH</option>
                  <option>Idosos</option>
                  <option>Crianças</option>
                  <option>Adolescentes</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 flex-1 grow">
            <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">Preferência de faixa etária dos pacientes</label>
            <div className="flex flex-col items-start gap-2.5 px-4 py-3 relative self-stretch w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
              <div className="flex justify-between self-stretch w-full items-center relative">
                <select className="w-full font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer">
                  <option>Idosos</option>
                  <option>Crianças (0-12 anos)</option>
                  <option>Adolescentes (13-17 anos)</option>
                  <option>Adultos (18-59 anos)</option>
                </select>
                <img className="absolute right-0 w-3 h-[7px] pointer-events-none" alt="Vector" src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg" />
              </div>
            </div>
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
