import { useState, memo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { generalInfoSchema, GeneralInfoFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { PhoneInputIntl } from '@presentation/components/shared/PhoneInputIntl';
import { MultiSelect } from '@presentation/components/molecules/MultiSelect';
import { maskDate, parseDateToISO, formatDateFromISO } from '@presentation/hooks/useMask';
import { compressImage } from '@presentation/utils/imageCompression';
import { FormField, InputWithIcon, SelectField } from '@presentation/components/molecules';
import { Button } from '@presentation/components/atoms/Button';

export const GeneralInfoTab = memo(function GeneralInfoTab(): JSX.Element {
  const { t } = useTranslation();
  const { saveGeneralInfo, getProgress } = useWorkerApi();

  // Use individual selectors to prevent re-renders
  const data = useWorkerRegistrationStore((state) => state.data);
  const isFieldReadonly = useWorkerRegistrationStore((state) => state.isFieldReadonly);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(data.generalInfo.profilePhoto || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
    reset,
  } = useForm<GeneralInfoFormData>({
    resolver: zodResolver(generalInfoSchema) as import('react-hook-form').Resolver<GeneralInfoFormData>,
    defaultValues: {
      fullName: data.generalInfo.fullName || '',
      lastName: data.generalInfo.lastName || '',
      cpf: data.generalInfo.cpf || '',
      phone: data.generalInfo.phone || '',
      email: data.generalInfo.email || '',
      birthDate: data.generalInfo.birthDate || '',
      sex: (data.generalInfo.sex as 'male' | 'female' | undefined) || undefined,
      gender: (data.generalInfo.gender as 'male' | 'female' | 'other' | undefined) || undefined,
      documentType: (data.generalInfo.documentType as 'DNI' | 'CPF' | 'RG' | 'CNH') || 'DNI',
      professionalLicense: data.generalInfo.professionalLicense || '',
      languages: data.generalInfo.languages?.length ? (data.generalInfo.languages as Array<'pt' | 'es' | 'en'>) : [],
      profession: (data.generalInfo.profession as 'caregiver' | 'nurse' | 'psychologist' | 'physiotherapist' | undefined) || undefined,
      knowledgeLevel: (data.generalInfo.knowledgeLevel as 'bachelor' | 'technical' | 'masters' | 'doctorate' | undefined) || undefined,
      experienceTypes: data.generalInfo.experienceTypes?.length ? (data.generalInfo.experienceTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) : [],
      yearsExperience: (data.generalInfo.yearsExperience as '0_2' | '3_5' | '6_10' | '10_plus' | undefined) || undefined,
      preferredTypes: data.generalInfo.preferredTypes?.length ? (data.generalInfo.preferredTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) : [],
      preferredAgeRange: (data.generalInfo.preferredAgeRange as 'children' | 'adolescents' | 'adults' | 'elderly' | undefined) || undefined,
      profilePhoto: data.generalInfo.profilePhoto || null,
    },
    mode: 'onChange',
  });

  // Buscar dados reais do backend e preencher formulário
  useEffect(() => {
    const fetchWorkerData = async () => {
      try {
        const workerData = await getProgress();

        reset({
          fullName: workerData.firstName || '',
          lastName: workerData.lastName || '',
          cpf: workerData.documentNumber || '',
          phone: workerData.phone || '',
          email: workerData.email || '',
          birthDate: formatDateFromISO(workerData.birthDate || '') || '',
          sex: (workerData.sex?.toLowerCase() as 'male' | 'female') || undefined,
          gender: (workerData.gender?.toLowerCase() as 'male' | 'female' | 'other') || undefined,
          documentType: (workerData.documentType as 'DNI' | 'CPF' | 'RG' | 'CNH') || 'DNI',
          professionalLicense: workerData.titleCertificate || '',
          languages: (workerData.languages as Array<'pt' | 'es' | 'en'>) || [],
          profession: (workerData.profession as 'caregiver' | 'nurse' | 'psychologist' | 'physiotherapist') || undefined,
          knowledgeLevel: (workerData.knowledgeLevel as 'bachelor' | 'technical' | 'masters' | 'doctorate') || undefined,
          experienceTypes: (workerData.experienceTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) || [],
          yearsExperience: (workerData.yearsExperience as '0_2' | '3_5' | '6_10' | '10_plus') || undefined,
          preferredTypes: (workerData.preferredTypes as Array<'elderly' | 'adhd' | 'children' | 'adolescents' | 'adults'>) || [],
          preferredAgeRange: (workerData.preferredAgeRange as 'children' | 'adolescents' | 'adults' | 'elderly') || undefined,
          profilePhoto: workerData.profilePhotoUrl || null,
        });

        if (workerData.profilePhotoUrl) {
          setProfilePhotoPreview(workerData.profilePhotoUrl);
        }
      } catch (error) {
        console.error('Failed to fetch worker data:', error);
      }
    };

    fetchWorkerData();
  }, [getProgress, reset]);

  const onSubmit = async (formData: GeneralInfoFormData): Promise<void> => {
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      await saveGeneralInfo({
        firstName: formData.fullName.split(' ')[0] || formData.fullName,
        lastName: formData.lastName,
        sex: formData.sex as 'male' | 'female',
        gender: formData.gender as 'male' | 'female' | 'other',
        birthDate: parseDateToISO(formData.birthDate),
        documentType: formData.documentType,
        documentNumber: formData.cpf,
        phone: formData.phone,
        profilePhotoUrl: formData.profilePhoto || undefined,
        languages: formData.languages,
        profession: formData.profession as 'caregiver' | 'nurse' | 'psychologist' | 'physiotherapist',
        knowledgeLevel: formData.knowledgeLevel as 'bachelor' | 'technical' | 'masters' | 'doctorate',
        titleCertificate: formData.professionalLicense,
        experienceTypes: formData.experienceTypes,
        yearsExperience: formData.yearsExperience as '0_2' | '3_5' | '6_10' | '10_plus',
        preferredTypes: formData.preferredTypes,
        preferredAgeRange: formData.preferredAgeRange as 'children' | 'adolescents' | 'adults' | 'elderly',
        termsAccepted: true,
        privacyAccepted: true,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('workerRegistration.generalInfo.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const result = reader.result as string;
          const compressedImage = await compressImage(result, 400, 400, 0.8);
          setProfilePhotoPreview(compressedImage);
          setValue('profilePhoto', compressedImage);
        } catch (error) {
          console.error('[ProfilePhotoUpload] Compression failed:', error);
          const result = reader.result as string;
          setProfilePhotoPreview(result);
          setValue('profilePhoto', result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 w-full">
      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-input font-lexend text-sm text-green-700">
          {t('profile.saveSuccess', 'Informações salvas com sucesso!')}
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-input font-lexend text-sm text-red-700">
          {saveError}
        </div>
      )}

      {/* Profile Photo */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 relative flex items-center justify-center overflow-hidden rounded-full">
          {profilePhotoPreview ? (
            <img src={profilePhotoPreview} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
              </svg>
            </div>
          )}
        </div>
        <label className="px-4 py-2 bg-primary text-white rounded-pill font-lexend font-medium text-sm hover:bg-primary/90 transition-colors cursor-pointer">
          {t('workerRegistration.generalInfo.addProfilePhoto')}
          <input type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />
        </label>
      </div>

      {/* Form Fields - Simplified Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Email */}
        <FormField
          label={t('workerRegistration.generalInfo.email')}
          htmlFor="email"
          error={errors.email?.message}
        >
          <InputWithIcon
            id="email"
            type="email"
            {...register('email')}
            readOnly={isFieldReadonly('email')}
            className={isFieldReadonly('email') ? 'bg-gray-200' : ''}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 21.25H7C3.35 21.25 1.25 19.15 1.25 15.5V8.5C1.25 4.85 3.35 2.75 7 2.75H17C20.65 2.75 22.75 4.85 22.75 8.5V15.5C22.75 19.15 20.65 21.25 17 21.25ZM7 4.25C4.14 4.25 2.75 5.64 2.75 8.5V15.5C2.75 18.36 4.14 19.75 7 19.75H17C19.86 19.75 21.25 18.36 21.25 15.5V8.5C21.25 5.64 19.86 4.25 17 4.25H7Z" fill="#180149"/>
                <path d="M12.003 12.868C11.163 12.868 10.313 12.608 9.663 12.078L6.533 9.57802C6.213 9.31802 6.153 8.84802 6.413 8.52802C6.673 8.20802 7.143 8.14802 7.463 8.40802L10.593 10.908C11.353 11.518 12.643 11.518 13.403 10.908L16.533 8.40802C16.853 8.14802 17.333 8.19802 17.583 8.52802C17.843 8.84802 17.793 9.32802 17.463 9.57802L14.333 12.078C13.693 12.608 12.843 12.868 12.003 12.868Z" fill="#180149"/>
              </svg>
            }
          />
        </FormField>

        {/* Languages */}
        <Controller
          name="languages"
          control={control}
          render={({ field }) => (
            <MultiSelect
              testId="languages"
              label={t('workerRegistration.generalInfo.languages')}
              options={[
                { value: 'pt', label: t('workerRegistration.generalInfo.portuguese') },
                { value: 'es', label: t('workerRegistration.generalInfo.spanish') },
                { value: 'en', label: t('workerRegistration.generalInfo.english') },
              ]}
              value={field.value}
              onChange={field.onChange}
              placeholder={t('workerRegistration.generalInfo.select')}
              error={errors.languages?.message}
            />
          )}
        />

        {/* First Name */}
        <FormField
          label={t('workerRegistration.generalInfo.firstName')}
          htmlFor="fullName"
          error={errors.fullName?.message}
        >
          <InputWithIcon
            id="fullName"
            type="text"
            {...register('fullName')}
          />
        </FormField>

        {/* Last Name */}
        <FormField
          label={t('workerRegistration.generalInfo.lastName')}
          htmlFor="lastName"
          error={errors.lastName?.message}
        >
          <InputWithIcon
            id="lastName"
            type="text"
            {...register('lastName')}
          />
        </FormField>

        {/* Sex */}
        <Controller
          name="sex"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.sex')}
              htmlFor="sex"
              error={errors.sex?.message}
            >
              <SelectField
                id="sex"
                options={[
                  { value: 'male', label: t('workerRegistration.generalInfo.male') },
                  { value: 'female', label: t('workerRegistration.generalInfo.female') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Gender */}
        <Controller
          name="gender"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.gender')}
              htmlFor="gender"
            >
              <SelectField
                id="gender"
                options={[
                  { value: 'male', label: t('workerRegistration.generalInfo.male') },
                  { value: 'female', label: t('workerRegistration.generalInfo.female') },
                  { value: 'other', label: t('workerRegistration.generalInfo.other') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Birth Date */}
        <FormField
          label={t('workerRegistration.generalInfo.birthDate')}
          htmlFor="birthDate"
          error={errors.birthDate?.message}
        >
          <InputWithIcon
            id="birthDate"
            type="text"
            {...register('birthDate')}
            placeholder={t('workerRegistration.generalInfo.birthDatePlaceholder')}
            maxLength={10}
            onChange={(e) => {
              const maskedValue = maskDate(e.target.value);
              setValue('birthDate', maskedValue, { shouldValidate: true });
            }}
          />
        </FormField>

        {/* Document Type */}
        <Controller
          name="documentType"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.documentType')}
              htmlFor="documentType"
            >
              <SelectField
                id="documentType"
                options={[
                  { value: 'DNI', label: t('workerRegistration.generalInfo.dni') },
                  { value: 'CPF', label: t('workerRegistration.generalInfo.cpf') },
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Document Number */}
        <FormField
          label={t('workerRegistration.generalInfo.documentNumber')}
          htmlFor="cpf"
          error={errors.cpf?.message}
        >
          <InputWithIcon
            id="cpf"
            type="text"
            {...register('cpf')}
            readOnly={isFieldReadonly('cpf')}
            className={isFieldReadonly('cpf') ? 'bg-gray-200' : ''}
          />
        </FormField>

        {/* Phone */}
        <FormField
          label={t('workerRegistration.generalInfo.phone')}
          htmlFor="phone"
          error={errors.phone?.message}
        >
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneInputIntl
                value={field.value}
                onChange={field.onChange}
                placeholder={t('workerRegistration.generalInfo.phonePlaceholder')}
                readOnly={isFieldReadonly('phone')}
                className="border-gray-600 focus-within:border-primary"
              />
            )}
          />
        </FormField>

        {/* Profession */}
        <Controller
          name="profession"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.profession')}
              htmlFor="profession"
            >
              <SelectField
                id="profession"
                options={[
                  { value: 'caregiver', label: t('workerRegistration.generalInfo.caregiver') },
                  { value: 'nurse', label: t('workerRegistration.generalInfo.nurse') },
                  { value: 'psychologist', label: t('workerRegistration.generalInfo.psychologist') },
                  { value: 'physiotherapist', label: t('workerRegistration.generalInfo.physiotherapist') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Knowledge Level */}
        <Controller
          name="knowledgeLevel"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.knowledgeLevel')}
              htmlFor="knowledgeLevel"
              error={errors.knowledgeLevel?.message}
            >
              <SelectField
                id="knowledgeLevel"
                options={[
                  { value: 'bachelor', label: t('workerRegistration.generalInfo.bachelor') },
                  { value: 'technical', label: t('workerRegistration.generalInfo.technical') },
                  { value: 'masters', label: t('workerRegistration.generalInfo.masters') },
                  { value: 'doctorate', label: t('workerRegistration.generalInfo.doctorate') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Professional License */}
        <FormField
          label={t('workerRegistration.generalInfo.professionalLicense')}
          htmlFor="professionalLicense"
          error={errors.professionalLicense?.message}
        >
          <InputWithIcon
            id="professionalLicense"
            type="text"
            {...register('professionalLicense')}
            readOnly={isFieldReadonly('professionalLicense')}
            placeholder={t('workerRegistration.generalInfo.professionalLicensePlaceholder')}
            className={isFieldReadonly('professionalLicense') ? 'bg-gray-200' : ''}
          />
        </FormField>

        {/* Experience Types */}
        <Controller
          name="experienceTypes"
          control={control}
          render={({ field }) => (
            <MultiSelect
              testId="experience-types"
              label={t('workerRegistration.generalInfo.experienceTypes')}
              options={[
                { value: 'elderly', label: t('workerRegistration.generalInfo.elderly') },
                { value: 'adhd', label: t('workerRegistration.generalInfo.adhd') },
                { value: 'children', label: t('workerRegistration.generalInfo.children') },
                { value: 'adolescents', label: t('workerRegistration.generalInfo.adolescents') },
                { value: 'adults', label: t('workerRegistration.generalInfo.adults') },
              ]}
              value={field.value}
              onChange={field.onChange}
              placeholder={t('workerRegistration.generalInfo.select')}
              error={errors.experienceTypes?.message}
            />
          )}
        />

        {/* Years Experience */}
        <Controller
          name="yearsExperience"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.yearsExperience')}
              htmlFor="yearsExperience"
              error={errors.yearsExperience?.message}
            >
              <SelectField
                id="yearsExperience"
                options={[
                  { value: '0_2', label: t('workerRegistration.generalInfo.years0to2') },
                  { value: '3_5', label: t('workerRegistration.generalInfo.years3to5') },
                  { value: '6_10', label: t('workerRegistration.generalInfo.years6to10') },
                  { value: '10_plus', label: t('workerRegistration.generalInfo.years10plus') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />

        {/* Preferred Types */}
        <Controller
          name="preferredTypes"
          control={control}
          render={({ field }) => (
            <MultiSelect
              testId="preferred-types"
              label={t('workerRegistration.generalInfo.preferredTypes')}
              options={[
                { value: 'adhd', label: t('workerRegistration.generalInfo.adhd') },
                { value: 'elderly', label: t('workerRegistration.generalInfo.elderly') },
                { value: 'children', label: t('workerRegistration.generalInfo.children') },
                { value: 'adolescents', label: t('workerRegistration.generalInfo.adolescents') },
                { value: 'adults', label: t('workerRegistration.generalInfo.adults') },
              ]}
              value={field.value}
              onChange={field.onChange}
              placeholder={t('workerRegistration.generalInfo.select')}
              error={errors.preferredTypes?.message}
            />
          )}
        />

        {/* Preferred Age Range */}
        <Controller
          name="preferredAgeRange"
          control={control}
          render={({ field }) => (
            <FormField
              label={t('workerRegistration.generalInfo.preferredAgeRange')}
              htmlFor="preferredAgeRange"
              error={errors.preferredAgeRange?.message}
            >
              <SelectField
                id="preferredAgeRange"
                options={[
                  { value: 'children', label: t('workerRegistration.generalInfo.ageRangeChildren') },
                  { value: 'adolescents', label: t('workerRegistration.generalInfo.ageRangeAdolescents') },
                  { value: 'adults', label: t('workerRegistration.generalInfo.ageRangeAdults') },
                  { value: 'elderly', label: t('workerRegistration.generalInfo.ageRangeElderly') },
                ]}
                placeholder={t('workerRegistration.generalInfo.select')}
                value={field.value}
                onChange={field.onChange}
              />
            </FormField>
          )}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isSaving}
        >
          {t('profile.save', 'Salvar')}
        </Button>
      </div>
    </form>
  );
});
