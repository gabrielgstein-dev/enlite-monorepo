import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { serviceAddressSchema, ServiceAddressFormData } from '@presentation/validation/workerRegistrationSchemas';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { WizardNavigation } from '../WizardNavigation';
import { AddressField } from '../../ui/AddressField';
import { DistanceSlider } from '../../ui/DistanceSlider';

interface ServiceAddressStepProps {
  onValidationChange?: (isValid: boolean) => void;
}

export function ServiceAddressStep({ onValidationChange }: ServiceAddressStepProps) {
  const { data, updateServiceAddress, markStepCompleted, markStepIncomplete, goToNextStep, workerId } = useWorkerRegistrationStore();
  const { saveStep } = useWorkerApi();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isValid },
    watch,
    setValue,
  } = useForm<ServiceAddressFormData>({
    resolver: zodResolver(serviceAddressSchema),
    defaultValues: {
      serviceRadius: data.serviceAddress.serviceRadius || 10,
      address: data.serviceAddress.address || '',
      complement: data.serviceAddress.complement || '',
      acceptsRemoteService: data.serviceAddress.acceptsRemoteService || false,
    },
    mode: 'onChange',
  });

  const serviceRadius = watch('serviceRadius');
  const address = watch('address');
  const complement = watch('complement');
  const acceptsRemoteService = watch('acceptsRemoteService');

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(isValid);
    }
    
    if (isValid) {
      markStepCompleted('service-address');
    } else {
      markStepIncomplete('service-address');
    }
  }, [isValid, markStepCompleted, markStepIncomplete, onValidationChange]);

  useEffect(() => {
    updateServiceAddress({
      serviceRadius,
      address,
      complement,
      acceptsRemoteService,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceRadius, address, complement, acceptsRemoteService]);

  const onSubmit = async (formData: ServiceAddressFormData) => {
    if (!workerId) {
      goToNextStep();
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await saveStep(workerId, 3, {
        address: formData.address,
        addressComplement: formData.complement || undefined,
        serviceRadiusKm: formData.serviceRadius,
        // lat/lng are 0 for now — will be populated when map integration is added
        lat: 0,
        lng: 0,
      });
      goToNextStep();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col items-start gap-8 w-full max-w-[1200px]">
      <div className="flex flex-col gap-8 w-full">
        {/* Address Row */}
        <div className="flex items-center gap-5 w-full">
          <AddressField
            label="Endereço"
            containerClassName="w-[800px]"
            placeholder="Digite seu endereço"
            {...register('address')}
            error={errors.address?.message}
          />

          <AddressField
            label="Complemento do endereço"
            containerClassName="w-[380px]"
            placeholder="Apto/Bloco/etc"
            {...register('complement')}
            error={errors.complement?.message}
          />
        </div>

        {/* KM Input */}
        <div className="flex flex-col h-[74px] items-start gap-1 w-full relative">
          <p className="relative w-fit mt-[-1.00px] font-lexend font-medium text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">
            Há quantos km você está disposto a atender?
          </p>
          <div className="relative self-stretch w-full h-12 rounded-[10px] overflow-hidden border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white">
            <input
              type="number"
              min="1"
              max="50"
              {...register('serviceRadius', { valueAsNumber: true })}
              className="absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF] appearance-none"
            />
            <span className="absolute top-[calc(50%_-_10.5px)] right-4 font-lexend font-medium text-[#374151] text-[14px] pointer-events-none">
              km
            </span>
          </div>
          {errors.serviceRadius && <span className="text-red-500 text-xs absolute -bottom-4">{errors.serviceRadius.message}</span>}
        </div>

        {/* Slider + Map */}
        <div className="w-full mt-4">
          <Controller
            control={control}
            name="serviceRadius"
            render={({ field }) => (
              <DistanceSlider 
                value={field.value} 
                onChange={(val: number) => field.onChange(val)} 
              />
            )}
          />
        </div>

        {/* Remote Service Option */}
        <div className="flex flex-col gap-4 pt-4 mb-8">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                {...register('acceptsRemoteService')}
                className="sr-only"
              />
              <div
                onClick={() => setValue('acceptsRemoteService', !acceptsRemoteService, { shouldValidate: true })}
                className={`
                  w-12 h-7 rounded-full transition-colors duration-200 cursor-pointer
                  ${acceptsRemoteService ? 'bg-[#180149]' : 'bg-[#D9D9D9]'}
                `}
              >
                <div
                  className={`
                    w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200
                    absolute top-1 left-1
                    ${acceptsRemoteService ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </div>
            </div>
            <span className="font-lexend text-base font-semibold text-[#737373]">
              Aceito realizar atendimentos remotos/online
            </span>
          </label>
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
